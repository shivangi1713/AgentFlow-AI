import { NextResponse } from "next/server";
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { checkTenantQuota } from "@/lib/metering";
import { getRequestBaseUrl, publishJsonOrFetch } from "@/lib/qstash";
import { executionRatelimit, webhookRatelimit } from "@/lib/ratelimit";
import { getActiveWorkflowVersion } from "@/lib/workflowVersions";

const MAX_WEBHOOK_DRIFT_SECONDS = 300;

function safeCompareHex(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function createWebhookSignature(input: {
  secret: string;
  timestamp: string;
  nonce: string;
  rawBody: string;
}) {
  return crypto
    .createHmac("sha256", input.secret)
    .update(`${input.timestamp}.${input.nonce}.${input.rawBody}`)
    .digest("hex");
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Internal DAG Execution Error";
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  const { workflowId } = await params;

  try {
    const rawBodyText = await req.text();
    const timestamp = req.headers.get("x-agentflow-timestamp");
    const signature = req.headers.get("x-agentflow-signature");
    const nonce = req.headers.get("x-agentflow-nonce");

    if (!timestamp || !signature || !nonce) {
      return NextResponse.json(
        { error: "Unauthorized: Missing HMAC authentication headers" },
        { status: 401 }
      );
    }

    const parsedTimestamp = Number.parseInt(timestamp, 10);
    const currentUnix = Math.floor(Date.now() / 1000);

    if (!Number.isFinite(parsedTimestamp) || Math.abs(currentUnix - parsedTimestamp) > MAX_WEBHOOK_DRIFT_SECONDS) {
      return NextResponse.json({ error: "Request timestamp expired" }, { status: 401 });
    }

    const rateLimit = await webhookRatelimit.limit(`wf:${workflowId}`);
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Too many requests for this workflow." },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": String(rateLimit.limit),
            "X-RateLimit-Remaining": String(rateLimit.remaining),
            "X-RateLimit-Reset": String(rateLimit.reset),
          },
        }
      );
    }

    // 1. Fetch Workflow
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
    });

    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    // 2. HMAC-SHA256 signature verification.
    // Signature base: `${timestamp}.${nonce}.${rawBody}`
    const expectedSignature = createWebhookSignature({
      secret: workflow.webhookSecret,
      timestamp,
      nonce,
      rawBody: rawBodyText,
    });

    if (!safeCompareHex(signature, expectedSignature)) {
      return NextResponse.json({ error: "Forbidden: Invalid webhook signature" }, { status: 403 });
    }

    if (workflow.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Workflow is not published. Publish it from the editor before triggering." },
        { status: 400 }
      );
    }

    const quota = await checkTenantQuota(workflow.userId);
    if (!quota.allowed) {
      return NextResponse.json(
        {
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
        { error: "Execution limit exceeded for this tenant." },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": String(executionLimit.limit),
            "X-RateLimit-Remaining": String(executionLimit.remaining),
            "X-RateLimit-Reset": String(executionLimit.reset),
          },
        }
      );
    }

    // 3. Extract & Normalize Incoming Webhook Payload
    let triggerPayload: unknown;

    try {
      triggerPayload = JSON.parse(rawBodyText);
    } catch {
      triggerPayload = { rawBody: rawBodyText };
    }

    const activeVersion = await getActiveWorkflowVersion(workflow.id);
    if (!activeVersion) {
      return NextResponse.json(
        { error: "Workflow has no published version. Publish it before triggering." },
        { status: 400 }
      );
    }
    const idempotencyKey = `${workflow.id}:webhook:${nonce}`;

    const existingRun = await prisma.executionRun.findUnique({
      where: { idempotencyKey },
    });

    if (existingRun) {
      return NextResponse.json(
        {
          success: false,
          runId: existingRun.id,
          status: existingRun.status,
          error: "Replay rejected: nonce has already been used",
        },
        { status: 409 }
      );
    }

    // 4. Create durable execution run in Neon DB
    const traceId = req.headers.get("x-agentflow-trace-id") || crypto.randomUUID();
    const run = await prisma.executionRun.create({
      data: {
        workflowId: workflow.id,
        workflowVersionId: activeVersion.id,
        userId: workflow.userId,
        traceId,
        status: "QUEUED",
        idempotencyKey,
        triggerPayload: triggerPayload as Prisma.InputJsonValue,
        events: {
          create: {
            traceId,
            type: "RUN_QUEUED",
            payload: {
              source: "webhook",
              workflowVersionId: activeVersion.id,
              traceId,
            },
          },
        },
      },
    });

    // 5. Enqueue run start worker and return immediately
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
      label: ["agentflow", "run-start"],
      traceId,
    });

    return NextResponse.json(
      {
        success: true,
        runId: run.id,
        traceId,
        workflowVersionId: activeVersion.id,
        status: "QUEUED",
        queued: true,
        messageId: "messageId" in queueResult ? queueResult.messageId : undefined,
      },
      { status: 202 }
    );

  } catch (error: unknown) {
    console.error("Webhook Execution Error:", error);
    const errorMessage = getErrorMessage(error);

    return NextResponse.json(
      {
        success: false,
        status: "FAILED",
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
