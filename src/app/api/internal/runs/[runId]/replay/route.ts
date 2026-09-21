import { NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import { FlowEdge, FlowNode } from "@/lib/executionEngine";
import { getDescendantNodeIds, getRootNodeIds } from "@/lib/graph";
import { getRequestBaseUrl, publishJsonOrFetch } from "@/lib/qstash";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Replay failed";
}

function getReplayTarget(input: {
  requestedNodeId?: string;
  mode?: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  steps: Array<{ nodeId: string; status: string }>;
}) {
  if (input.requestedNodeId) return input.requestedNodeId;

  if (input.mode === "run") {
    return getRootNodeIds(input.nodes, input.edges)[0];
  }

  const failedStep = input.steps.find((step) => ["FAILED", "RETRYING"].includes(step.status));
  if (failedStep) return failedStep.nodeId;

  return getRootNodeIds(input.nodes, input.edges)[0];
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const requestedNodeId = typeof body.nodeId === "string" ? body.nodeId : undefined;
    const mode = typeof body.mode === "string" ? body.mode : "failed";
    const triggerPayloadOverride =
      mode === "run" && Object.prototype.hasOwnProperty.call(body, "triggerPayload")
        ? body.triggerPayload
        : undefined;

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

    const nodes = run.workflowVersion.nodes as unknown as FlowNode[];
    const edges = run.workflowVersion.edges as unknown as FlowEdge[];
    const targetNodeId = getReplayTarget({
      requestedNodeId,
      mode,
      nodes,
      edges,
      steps: run.steps,
    });

    if (!targetNodeId || !nodes.some((node) => node.id === targetNodeId)) {
      return NextResponse.json({ error: "Replay target node not found" }, { status: 404 });
    }

    const resetNodeIds =
      mode === "run"
        ? new Set(nodes.map((node) => node.id))
        : new Set([targetNodeId, ...getDescendantNodeIds(targetNodeId, edges)]);
    const replayId = crypto.randomUUID();

    await prisma.executionStep.updateMany({
      where: {
        runId,
        nodeId: { in: [...resetNodeIds] },
      },
      data: {
        status: "PENDING",
        inputData: undefined,
        outputData: undefined,
        errorMessage: null,
        durationMs: null,
        startedAt: null,
        completedAt: null,
      },
    });

    await prisma.executionRun.update({
      where: { id: runId },
      data: {
        status: "RUNNING",
        endedAt: null,
        errorMessage: null,
        ...(triggerPayloadOverride !== undefined ? { triggerPayload: triggerPayloadOverride } : {}),
        events: {
          create: {
            traceId: run.traceId,
            type: "REPLAY_REQUESTED",
            payload: {
              replayId,
              mode,
              targetNodeId,
              resetNodeIds: [...resetNodeIds],
              traceId: run.traceId,
              triggerPayloadOverridden: triggerPayloadOverride !== undefined,
            },
          },
        },
      },
    });

    const targetNode = nodes.find((node) => node.id === targetNodeId);
    const baseUrl = getRequestBaseUrl(req);
    const failureCallback = `${baseUrl}/api/internal/qstash/failure`;

    const queueResult = await publishJsonOrFetch({
      req,
      url: `${baseUrl}/api/internal/runs/${runId}/nodes/${targetNodeId}/execute`,
      body: { runId, nodeId: targetNodeId, replayId, traceId: run.traceId },
      deduplicationId: `${runId}:${targetNodeId}:replay:${replayId}`,
      failureCallback,
      retries: 3,
      timeout: targetNode?.type === "geminiNode" ? 55 : 30,
      flowControl:
        targetNode?.type === "geminiNode"
          ? {
              key: `gemini:${run.userId}`,
              parallelism: 3,
              rate: 30,
              period: "1m",
            }
          : undefined,
      label: ["agentflow", "node-replay", targetNode?.type || "default"],
      traceId: run.traceId,
    });

    return NextResponse.json(
      {
        success: true,
        runId,
        replayId,
        targetNodeId,
        resetNodeIds: [...resetNodeIds],
        messageId: "messageId" in queueResult ? queueResult.messageId : undefined,
      },
      { status: 202 }
    );
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
