import { NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import { checkTenantQuota } from "@/lib/metering";
import { executionRatelimit } from "@/lib/ratelimit";
import { getWorkflow } from "@/lib/workflowStore";
import { getActiveWorkflowVersion } from "@/lib/workflowVersions";
import { getRequestBaseUrl, publishJsonOrFetch } from "@/lib/qstash";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Workflow execution queueing failed";
}

export async function POST(req: Request) {
  try {
    const { workflowId, inputData } = await req.json();

    if (!workflowId) {
      return NextResponse.json({ error: "Workflow ID is required" }, { status: 400 });
    }

    const workflow = await getWorkflow(workflowId);

    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    const activeVersion = await getActiveWorkflowVersion(workflow.id);
    if (!activeVersion || workflow.status !== "ACTIVE") {
      return NextResponse.json(
        { success: false, error: "Workflow is not published. Publish it before running." },
        { status: 400 }
      );
    }

    const quota = await checkTenantQuota(workflow.userId);
    if (!quota.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Monthly execution quota exceeded.",
          usage: quota.usage,
          limit: quota.limit,
        },
        { status: 402 }
      );
    }

    const executionLimit = await executionRatelimit.limit(`user:${workflow.userId}`);
    if (!executionLimit.success) {
      return NextResponse.json(
        { success: false, error: "Execution limit exceeded for this tenant." },
        { status: 429 }
      );
    }

    const triggerPayload = {
      source: "manual",
      inputData: inputData || "Default trigger payload",
    };
    const traceId = crypto.randomUUID();
    const idempotencyKey = `${workflow.id}:manual:${crypto.randomUUID()}`;

    const run = await prisma.executionRun.create({
      data: {
        workflowId: workflow.id,
        workflowVersionId: activeVersion.id,
        userId: workflow.userId,
        traceId,
        status: "QUEUED",
        idempotencyKey,
        triggerPayload,
        events: {
          create: {
            traceId,
            type: "RUN_QUEUED",
            payload: {
              source: "manual",
              workflowVersionId: activeVersion.id,
              traceId,
            },
          },
        },
      },
    });

    const baseUrl = getRequestBaseUrl(req);
    const failureCallback = `${baseUrl}/api/internal/qstash/failure`;
    const queueResult = await publishJsonOrFetch({
      req,
      url: `${baseUrl}/api/internal/runs/${run.id}/start`,
      body: { runId: run.id, traceId },
      deduplicationId: `${run.id}:start`,
      failureCallback,
      retries: 3,
      timeout: 30,
      label: ["agentflow", "run-start", "manual"],
      traceId,
    });

    return NextResponse.json({
      success: true,
      queued: true,
      runId: run.id,
      traceId,
      workflowVersionId: activeVersion.id,
      status: "QUEUED",
      message: "Workflow execution run queued successfully",
      messageId: "messageId" in queueResult ? queueResult.messageId : undefined,
    }, { status: 202 });
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
