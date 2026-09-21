import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import { isLocalDevFallbackEnabled } from "@/lib/env";

async function getCurrentUserId() {
  if (isLocalDevFallbackEnabled()) return "local-dev-user";
  const { userId } = await auth();
  return userId;
}

export async function GET() {
  const userId = await getCurrentUserId();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const events = await prisma.executionEvent.findMany({
    where: {
      type: "DLQ_CREATED",
      run: {
        ...(isLocalDevFallbackEnabled() ? {} : { userId }),
      },
    },
    include: {
      run: {
        include: {
          workflow: {
            select: {
              id: true,
              name: true,
            },
          },
          steps: {
            where: {
              status: { in: ["FAILED", "RETRYING"] },
            },
            orderBy: { updatedAt: "desc" },
          },
          events: {
            where: {
              type: { in: ["RUN_FAILED", "STEP_RETRYING", "CIRCUIT_OPEN"] },
            },
            orderBy: { createdAt: "desc" },
            take: 5,
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    items: events.map((event) => ({
      eventId: event.id,
      runId: event.runId,
      traceId: event.traceId || event.run.traceId,
      workflowId: event.run.workflowId,
      workflowName: event.run.workflow.name,
      status: event.run.status,
      triggerPayload: event.run.triggerPayload,
      dlqPayload: event.payload,
      failedSteps: event.run.steps.map((step) => ({
        nodeId: step.nodeId,
        nodeType: step.nodeType,
        status: step.status,
        errorMessage: step.errorMessage,
        attemptCount: step.attemptCount,
        updatedAt: step.updatedAt,
      })),
      recentErrors: event.run.events.map((runEvent) => ({
        type: runEvent.type,
        stepId: runEvent.stepId,
        payload: runEvent.payload,
        createdAt: runEvent.createdAt,
      })),
      createdAt: event.createdAt,
    })),
  });
}
