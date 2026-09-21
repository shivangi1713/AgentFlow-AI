import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { cleanEnv } from "@/lib/env";

const RUN_TIMEOUT_MS = 10 * 60 * 1000;
const STEP_TIMEOUT_MS = 2 * 60 * 1000;

function isAuthorized(req: Request) {
  const cronSecret = cleanEnv(process.env.CRON_SECRET);
  const authHeader = req.headers.get("authorization");

  return Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const runCutoff = new Date(Date.now() - RUN_TIMEOUT_MS);
  const stepCutoff = new Date(Date.now() - STEP_TIMEOUT_MS);

  const stuckRuns = await prisma.executionRun.findMany({
    where: {
      status: "RUNNING",
      startedAt: { lt: runCutoff },
    },
    select: {
      id: true,
      startedAt: true,
      traceId: true,
    },
  });

  const staleRunningSteps = await prisma.executionStep.findMany({
    where: {
      status: "RUNNING",
      startedAt: { lt: stepCutoff },
      run: {
        status: "RUNNING",
      },
    },
    select: {
      runId: true,
      nodeId: true,
    },
  });

  const timedOutRunIds = new Set(stuckRuns.map((run) => run.id));
  for (const step of staleRunningSteps) {
    timedOutRunIds.add(step.runId);
  }

  if (timedOutRunIds.size === 0) {
    return NextResponse.json({
      success: true,
      message: "No stuck runs or steps found",
      checkedAt: now.toISOString(),
    });
  }

  const runIds = [...timedOutRunIds];
  const timedOutRuns = await prisma.executionRun.findMany({
    where: { id: { in: runIds } },
    select: { id: true, traceId: true },
  });
  const traceIdByRunId = new Map(timedOutRuns.map((run) => [run.id, run.traceId]));

  await prisma.executionStep.updateMany({
    where: {
      runId: { in: runIds },
      status: { in: ["RUNNING", "RETRYING"] },
    },
    data: {
      status: "FAILED",
      errorMessage: "Execution timed out by watchdog",
      completedAt: now,
    },
  });

  await prisma.executionRun.updateMany({
    where: { id: { in: runIds } },
    data: {
      status: "TIMED_OUT",
      endedAt: now,
      errorMessage: "Execution timed out by watchdog",
    },
  });

  await prisma.executionEvent.createMany({
    data: runIds.map((runId) => ({
      runId,
      traceId: traceIdByRunId.get(runId),
      type: "RUN_TIMED_OUT",
      payload: {
        reason: "WATCHDOG_TIMEOUT",
        traceId: traceIdByRunId.get(runId),
        staleStepNodeIds: staleRunningSteps
          .filter((step) => step.runId === runId)
          .map((step) => step.nodeId),
      },
    })),
  });

  return NextResponse.json({
    success: true,
    timedOutRunsCount: runIds.length,
    staleStepsCount: staleRunningSteps.length,
    checkedAt: now.toISOString(),
  });
}
