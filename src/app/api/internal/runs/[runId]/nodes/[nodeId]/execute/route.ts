import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  getCircuitProvider,
  isCircuitOpen,
  recordProviderFailure,
  resetCircuit,
} from "@/lib/circuitBreaker";
import { executeFlowNode, FlowEdge, FlowNode } from "@/lib/executionEngine";
import { getRequestBaseUrl, publishJsonOrFetch, verifyQstashSignature } from "@/lib/qstash";

const TERMINAL_RUN_STATUSES = ["SUCCEEDED", "FAILED", "CANCELED", "TIMED_OUT"];

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Node execution failed";
}

function buildNodeInput(input: {
  nodeId: string;
  edges: FlowEdge[];
  triggerPayload: unknown;
  completedSteps: Array<{ nodeId: string; outputData: unknown }>;
}) {
  const incomingEdges = input.edges.filter((edge) => edge.target === input.nodeId);

  if (incomingEdges.length === 0) {
    return typeof input.triggerPayload === "string"
      ? input.triggerPayload
      : JSON.stringify(input.triggerPayload, null, 2);
  }

  const parentOutputs = Object.fromEntries(
    incomingEdges.map((edge) => {
      const step = input.completedSteps.find((item) => item.nodeId === edge.source);
      return [edge.source, step?.outputData ?? null];
    })
  );

  return JSON.stringify(
    {
      triggerPayload: input.triggerPayload,
      parentOutputs,
    },
    null,
    2
  );
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ runId: string; nodeId: string }> }
) {
  const rawBody = await req.text();
  const isValid = await verifyQstashSignature(req, rawBody);

  if (!isValid) {
    return NextResponse.json({ error: "Unauthorized worker request" }, { status: 401 });
  }

  const { runId, nodeId } = await params;
  const startedAt = new Date();
  const startTime = Date.now();

  try {
    const run = await prisma.executionRun.findUnique({
      where: { id: runId },
      include: {
        workflowVersion: true,
        steps: true,
      },
    });

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    if (TERMINAL_RUN_STATUSES.includes(run.status)) {
      return NextResponse.json({ success: true, status: run.status, skipped: true });
    }

    const nodes = run.workflowVersion.nodes as unknown as FlowNode[];
    const edges = run.workflowVersion.edges as unknown as FlowEdge[];
    const currentNode = nodes.find((node) => node.id === nodeId);

    if (!currentNode) {
      return NextResponse.json({ error: "Node not found in workflow version" }, { status: 404 });
    }

    const existingStep = run.steps.find((step) => step.nodeId === nodeId);
    if (existingStep?.status === "SUCCEEDED") {
      return NextResponse.json({ success: true, nodeId, idempotent: true });
    }
    if (existingStep?.status === "RUNNING") {
      return NextResponse.json({ success: true, nodeId, status: "RUNNING" }, { status: 202 });
    }

    const incomingEdges = edges.filter((edge) => edge.target === nodeId);
    const completedSteps = run.steps.filter((step) => step.status === "SUCCEEDED");
    const completedNodeIds = new Set(completedSteps.map((step) => step.nodeId));
    const dependenciesReady = incomingEdges.every((edge) => completedNodeIds.has(edge.source));

    if (!dependenciesReady) {
      await prisma.executionStep.upsert({
        where: { runId_nodeId: { runId, nodeId } },
        update: { status: "PENDING" },
        create: {
          runId,
          traceId: run.traceId,
          nodeId,
          nodeType: currentNode.type || "default",
          status: "PENDING",
        },
      });

      return NextResponse.json({ success: true, nodeId, status: "PENDING" }, { status: 202 });
    }

    const providerKey = getCircuitProvider(currentNode.type);

    if (providerKey && (await isCircuitOpen(providerKey))) {
      const errorMessage = `Circuit breaker is OPEN for [${providerKey}]. Fast-failing execution.`;

      await prisma.executionStep.upsert({
        where: { runId_nodeId: { runId, nodeId } },
        update: {
          status: "RETRYING",
          errorMessage,
          startedAt,
        },
        create: {
          runId,
          traceId: run.traceId,
          nodeId,
          nodeType: currentNode.type || "default",
          status: "RETRYING",
          errorMessage,
          startedAt,
        },
      });

      await prisma.executionEvent.create({
        data: {
          runId,
          traceId: run.traceId,
          stepId: nodeId,
          type: "CIRCUIT_OPEN",
          payload: { nodeId, provider: providerKey, traceId: run.traceId },
        },
      });

      return NextResponse.json({ error: errorMessage, retryable: true }, { status: 503 });
    }

    const nodeInput = buildNodeInput({
      nodeId,
      edges,
      triggerPayload: run.triggerPayload,
      completedSteps,
    });

    await prisma.executionStep.upsert({
      where: { runId_nodeId: { runId, nodeId } },
      update: {
        status: "RUNNING",
        traceId: run.traceId,
        inputData: nodeInput,
        startedAt,
        completedAt: null,
        errorMessage: null,
        attemptCount: { increment: 1 },
      },
      create: {
        runId,
        traceId: run.traceId,
        nodeId,
        nodeType: currentNode.type || "default",
        status: "RUNNING",
        inputData: nodeInput,
        startedAt,
        attemptCount: 1,
      },
    });

    await prisma.executionEvent.create({
      data: {
        runId,
        traceId: run.traceId,
        stepId: nodeId,
        type: "STEP_STARTED",
        payload: { nodeId, nodeType: currentNode.type || "default", traceId: run.traceId },
      },
    });

    const output = await executeFlowNode(currentNode, nodeInput, run.traceId);
    const durationMs = Date.now() - startTime;

    if (providerKey) {
      await resetCircuit(providerKey);
    }

    await prisma.executionStep.update({
      where: { runId_nodeId: { runId, nodeId } },
      data: {
        status: "SUCCEEDED",
        traceId: run.traceId,
        outputData: { output },
        durationMs,
        completedAt: new Date(),
        errorMessage: null,
      },
    });

    await prisma.executionEvent.create({
      data: {
        runId,
        traceId: run.traceId,
        stepId: nodeId,
        type: "STEP_SUCCEEDED",
        payload: { nodeId, durationMs, traceId: run.traceId },
      },
    });

    const refreshedSteps = await prisma.executionStep.findMany({ where: { runId } });
    const succeededNodeIds = new Set(refreshedSteps.filter((step) => step.status === "SUCCEEDED").map((step) => step.nodeId));
    const baseUrl = getRequestBaseUrl(req);
    const failureCallback = `${baseUrl}/api/internal/qstash/failure`;
    const outgoingEdges = edges.filter((edge) => edge.source === nodeId);
    const scheduledChildren: string[] = [];

    for (const edge of outgoingEdges) {
      const childNodeId = edge.target;
      const childNode = nodes.find((node) => node.id === childNodeId);
      if (!childNode) continue;

      const childIncomingEdges = edges.filter((candidate) => candidate.target === childNodeId);
      const childReady = childIncomingEdges.every((candidate) => succeededNodeIds.has(candidate.source));

      if (!childReady || succeededNodeIds.has(childNodeId)) continue;

      await prisma.executionStep.update({
        where: { runId_nodeId: { runId, nodeId: childNodeId } },
        data: { status: "READY", traceId: run.traceId },
      });

      await publishJsonOrFetch({
        req,
        url: `${baseUrl}/api/internal/runs/${runId}/nodes/${childNodeId}/execute`,
        body: { runId, nodeId: childNodeId, traceId: run.traceId },
        deduplicationId: `${runId}:${childNodeId}:ready`,
        failureCallback,
        retries: 3,
        timeout: childNode.type === "geminiNode" ? 55 : 30,
        flowControl:
          childNode.type === "geminiNode"
            ? {
                key: `gemini:${run.userId}`,
                parallelism: 3,
                rate: 30,
                period: "1m",
              }
            : undefined,
        label: ["agentflow", "node-execute", childNode.type || "default"],
        traceId: run.traceId,
      });

      scheduledChildren.push(childNodeId);
    }

    const allDone = refreshedSteps.length === nodes.length && refreshedSteps.every((step) => step.status === "SUCCEEDED");

    if (allDone) {
      const runStartedAt = run.startedAt?.getTime() || startedAt.getTime();
      await prisma.executionRun.update({
        where: { id: runId },
        data: {
          status: "SUCCEEDED",
          endedAt: new Date(),
          durationMs: Date.now() - runStartedAt,
          events: {
            create: {
              type: "RUN_SUCCEEDED",
              traceId: run.traceId,
              payload: { completedNodeCount: nodes.length, traceId: run.traceId },
            },
          },
        },
      });
    }

    return NextResponse.json({ success: true, nodeId, scheduledChildren });
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    const run = await prisma.executionRun.findUnique({
      where: { id: runId },
      include: { workflowVersion: true },
    }).catch(() => null);
    const currentNode = run
      ? (run.workflowVersion.nodes as unknown as FlowNode[]).find((node) => node.id === nodeId)
      : null;
    const providerKey = getCircuitProvider(currentNode?.type);

    if (providerKey) {
      await recordProviderFailure(providerKey).catch(() => null);
    }

    await prisma.executionStep.update({
      where: { runId_nodeId: { runId, nodeId } },
      data: {
        status: "RETRYING",
        traceId: run?.traceId,
        errorMessage,
        durationMs: Date.now() - startTime,
      },
    }).catch(() => null);

    await prisma.executionEvent.create({
      data: {
        runId,
        traceId: run?.traceId,
        stepId: nodeId,
        type: "STEP_RETRYING",
        payload: { nodeId, error: errorMessage, traceId: run?.traceId },
      },
    }).catch(() => null);

    return NextResponse.json(
      { error: errorMessage, retryable: true },
      { status: 500 }
    );
  }
}
