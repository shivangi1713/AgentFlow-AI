import assert from "node:assert/strict";
import prisma from "../src/lib/prisma";
import {
  createCircuitBreaker,
  createMemoryCircuitBreakerStore,
} from "../src/lib/circuitBreaker";

type TestResult = {
  name: string;
  status: "passed" | "skipped";
  details?: string;
};

type SseMessage = {
  event: string;
  data: unknown;
};

const results: TestResult[] = [];

function env(name: string) {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : null;
}

function getBaseUrl() {
  const baseUrl = env("AGENTFLOW_TEST_BASE_URL");
  return baseUrl ? baseUrl.replace(/\/$/, "") : null;
}

function headersWithAuth() {
  const cookie = env("AGENTFLOW_TEST_COOKIE");
  return cookie ? { Cookie: cookie } : undefined;
}

function record(result: TestResult) {
  results.push(result);
}

async function testCircuitBreaker() {
  const store = createMemoryCircuitBreakerStore();
  const breaker = createCircuitBreaker(store);
  const provider = "geminiNode";

  await breaker.resetCircuit(provider);

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await breaker.recordProviderFailure(provider);
    assert.equal(await breaker.isCircuitOpen(provider), false, `circuit opened before attempt ${attempt}`);
  }

  await breaker.recordProviderFailure(provider);
  assert.equal(await breaker.isCircuitOpen(provider), true, "circuit should open on fifth failure");

  await breaker.resetCircuit(provider);
  assert.equal(await breaker.isCircuitOpen(provider), false, "circuit should close after reset");

  record({ name: "Rate Limiter & Circuit Breaker", status: "passed" });
}

async function testReplayRoute() {
  const baseUrl = getBaseUrl();
  const runId = env("AGENTFLOW_TEST_RUN_ID");
  const nodeId = env("AGENTFLOW_TEST_NODE_ID");

  if (!baseUrl || !runId || !nodeId) {
    record({
      name: "Replay & DLQ API",
      status: "skipped",
      details: "Set AGENTFLOW_TEST_BASE_URL, AGENTFLOW_TEST_RUN_ID, and AGENTFLOW_TEST_NODE_ID to run this live check.",
    });
    return;
  }

  const replayResponse = await fetch(`${baseUrl}/api/internal/runs/${runId}/replay`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(headersWithAuth() || {}),
    },
    body: JSON.stringify({ nodeId }),
  });

  const body = await replayResponse.json() as { success?: boolean; error?: string };
  assert.equal(replayResponse.status, 202, body.error || "replay route should return 202 Accepted");
  assert.equal(body.success, true, "replay route should report success");

  const step = await prisma.executionStep.findUnique({
    where: { runId_nodeId: { runId, nodeId } },
    select: { status: true },
  });

  assert.equal(step?.status, "PENDING", "target replay step should reset to PENDING before worker execution");

  record({ name: "Replay & DLQ API", status: "passed" });
}

function parseSseChunk(buffer: string): { messages: SseMessage[]; remainder: string } {
  const messages: SseMessage[] = [];
  const frames = buffer.split(/\n\n/);
  const remainder = frames.pop() || "";

  for (const frame of frames) {
    const lines = frame.split("\n");
    const eventLine = lines.find((line) => line.startsWith("event: "));
    const dataLine = lines.find((line) => line.startsWith("data: "));

    if (!eventLine || !dataLine) continue;

    messages.push({
      event: eventLine.replace("event: ", ""),
      data: JSON.parse(dataLine.replace("data: ", "")) as unknown,
    });
  }

  return { messages, remainder };
}

async function testSseStream() {
  const baseUrl = getBaseUrl();
  const runId = env("AGENTFLOW_TEST_RUN_ID");

  if (!baseUrl || !runId) {
    record({
      name: "SSE Stream Route",
      status: "skipped",
      details: "Set AGENTFLOW_TEST_BASE_URL and AGENTFLOW_TEST_RUN_ID to run this live check.",
    });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  const response = await fetch(`${baseUrl}/api/runs/${runId}/stream`, {
    headers: headersWithAuth(),
    signal: controller.signal,
  });

  assert.equal(response.status, 200, "SSE route should return 200");
  assert.equal(response.headers.get("content-type")?.startsWith("text/event-stream"), true);
  assert.ok(response.body, "SSE route should expose a readable stream");

  const expectedTypes = new Set(["STEP_STARTED", "STEP_SUCCEEDED", "STEP_FAILED"]);
  const seenTypes = new Set<string>();
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let pending = "";

  try {
    while (seenTypes.size < expectedTypes.size) {
      const read = await reader.read();
      if (read.done) break;

      pending += decoder.decode(read.value, { stream: true });
      const parsed = parseSseChunk(pending);
      pending = parsed.remainder;

      for (const message of parsed.messages) {
        if (message.event !== "execution-event") continue;
        const data = message.data as { type?: string };
        if (data.type && expectedTypes.has(data.type)) {
          seenTypes.add(data.type);
        }
      }
    }
  } finally {
    clearTimeout(timeout);
    controller.abort();
    reader.releaseLock();
  }

  assert.deepEqual([...seenTypes].sort(), [...expectedTypes].sort(), "SSE stream should include started/succeeded/failed step events");

  record({ name: "SSE Stream Route", status: "passed" });
}

async function main() {
  await testCircuitBreaker();
  await testReplayRoute();
  await testSseStream();

  for (const result of results) {
    const suffix = result.details ? ` - ${result.details}` : "";
    process.stdout.write(`${result.status.toUpperCase()} ${result.name}${suffix}\n`);
  }

  await prisma.$disconnect();
}

main().catch(async (error: unknown) => {
  await prisma.$disconnect().catch(() => undefined);
  const message = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
