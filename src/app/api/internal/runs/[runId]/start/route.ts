import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestBaseUrl, publishJsonOrFetch, verifyQstashSignature } from "@/lib/qstash";
import { FlowEdge, FlowNode } from "@/lib/executionEngine";
import { getRootNodeIds } from "@/lib/graph";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Run start failed";
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const rawBody = await req.text();
  const isValid = await verifyQstashSignature(req, rawBody);

  if (!isValid) {
    return NextResponse.json({ error: "Unauthorized worker request" }, { status: 401 });
  }

  const { runId } = await params;

  try {
    const run = await prisma.executionRun.findUnique({
      where: { id: runId },
      include: { workflowVersion: true },
    });

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    if (["SUCCEEDED", "FAILED", "CANCELED", "TIMED_OUT"].includes(run.status)) {
      return NextResponse.json({ success: true, status: run.status });
    }

    const nodes = run.workflowVersion.nodes as unknown as FlowNode[];
    const edges = run.workflowVersion.edges as unknown as FlowEdge[];
    const rootNodeIds = getRootNodeIds(nodes, edges);

    if (rootNodeIds.length === 0) {
      await prisma.executionRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          endedAt: new Date(),
          errorMessage: "Workflow has no executable root node",
          events: {
            create: {
              traceId: run.traceId,
              type: "RUN_FAILED",
              payload: { reason: "NO_ROOT_NODE", traceId: run.traceId },
            },
          },
        },
      });

      return NextResponse.json({ error: "Workflow has no executable root node" }, { status: 400 });
    }

    await prisma.executionRun.update({
      where: { id: run.id },
      data: {
        status: "RUNNING",
        startedAt: run.startedAt ?? new Date(),
        traceId: run.traceId,
        events: {
          create: {
            traceId: run.traceId,
            type: "RUN_STARTED",
            payload: { rootNodeIds, traceId: run.traceId },
          },
        },
      },
    });

    await prisma.executionStep.createMany({
      data: nodes.map((node) => ({
        runId: run.id,
        traceId: run.traceId,
        nodeId: node.id,
        nodeType: node.type || "default",
        status: rootNodeIds.includes(node.id) ? "READY" : "PENDING",
      })),
      skipDuplicates: true,
    });

    const baseUrl = getRequestBaseUrl(req);
    const failureCallback = `${baseUrl}/api/internal/qstash/failure`;

    for (const nodeId of rootNodeIds) {
      const node = nodes.find((item) => item.id === nodeId);

      await publishJsonOrFetch({
        req,
        url: `${baseUrl}/api/internal/runs/${run.id}/nodes/${nodeId}/execute`,
        body: { runId: run.id, nodeId, traceId: run.traceId },
        deduplicationId: `${run.id}:${nodeId}:start`,
        failureCallback,
        retries: 3,
        timeout: node?.type === "geminiNode" ? 55 : 45,
        flowControl:
          node?.type === "geminiNode"
            ? {
                key: `gemini:${run.userId}`,
                parallelism: 3,
                rate: 30,
                period: "1m",
              }
            : undefined,
        label: ["agentflow", "node-execute", node?.type || "default"],
        traceId: run.traceId,
      });
    }

    return NextResponse.json({ success: true, runId: run.id, scheduled: rootNodeIds });
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    const failedRun = await prisma.executionRun.findUnique({
      where: { id: runId },
      select: { traceId: true },
    }).catch(() => null);

    await prisma.executionRun.update({
      where: { id: runId },
      data: {
        status: "FAILED",
        endedAt: new Date(),
        errorMessage,
        events: {
          create: {
            traceId: failedRun?.traceId,
            type: "RUN_FAILED",
            payload: { error: errorMessage, traceId: failedRun?.traceId },
          },
        },
      },
    }).catch(() => null);

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
