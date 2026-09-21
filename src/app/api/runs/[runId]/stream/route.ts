import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import { isLocalDevFallbackEnabled } from "@/lib/env";

export const dynamic = "force-dynamic";

async function getCurrentUserId() {
  if (isLocalDevFallbackEnabled()) return "local-dev-user";
  const { userId } = await auth();
  return userId;
}

function encodeSse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  const userId = await getCurrentUserId();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const run = await prisma.executionRun.findFirst({
    where: {
      id: runId,
      ...(isLocalDevFallbackEnabled() ? {} : { userId }),
    },
    select: {
      id: true,
      traceId: true,
      status: true,
    },
  });

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const seenEventIds = new Set<string>();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      let interval: ReturnType<typeof setInterval> | null = null;

      const close = () => {
        if (closed) return;
        closed = true;
        if (interval) clearInterval(interval);
        controller.close();
      };

      req.signal.addEventListener("abort", close);

      const pushEvents = async () => {
        if (closed) return;

        const [currentRun, events] = await Promise.all([
          prisma.executionRun.findUnique({
            where: { id: runId },
            select: { status: true, traceId: true, updatedAt: true },
          }),
          prisma.executionEvent.findMany({
            where: { runId },
            orderBy: { createdAt: "asc" },
            take: 100,
          }),
        ]);

        for (const event of events) {
          if (seenEventIds.has(event.id)) continue;
          seenEventIds.add(event.id);

          controller.enqueue(
            encoder.encode(
              encodeSse("execution-event", {
                id: event.id,
                runId,
                traceId: event.traceId || currentRun?.traceId,
                type: event.type,
                stepId: event.stepId,
                payload: event.payload,
                createdAt: event.createdAt,
              })
            )
          );
        }

        controller.enqueue(
          encoder.encode(
            encodeSse("run-status", {
              runId,
              traceId: currentRun?.traceId,
              status: currentRun?.status,
              updatedAt: currentRun?.updatedAt,
            })
          )
        );

        if (currentRun && ["SUCCEEDED", "FAILED", "CANCELED", "TIMED_OUT"].includes(currentRun.status)) {
          close();
        }
      };

      interval = setInterval(pushEvents, 1500);
      controller.enqueue(encoder.encode(encodeSse("connected", run)));
      await pushEvents();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
