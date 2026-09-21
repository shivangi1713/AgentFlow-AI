import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { verifyQstashSignature } from "@/lib/qstash";

function findValueByKey(value: unknown, key: string): string | undefined {
  if (typeof value === "string" && value.trim().startsWith("{")) {
    try {
      return findValueByKey(JSON.parse(value), key);
    } catch {
      return undefined;
    }
  }

  if (!value || typeof value !== "object") return undefined;

  if (Object.prototype.hasOwnProperty.call(value, key)) {
    const candidate = (value as Record<string, unknown>)[key];
    return typeof candidate === "string" ? candidate : undefined;
  }

  for (const child of Object.values(value as Record<string, unknown>)) {
    const found = findValueByKey(child, key);
    if (found) return found;
  }

  return undefined;
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const isValid = await verifyQstashSignature(req, rawBody);

  if (!isValid) {
    return NextResponse.json({ error: "Unauthorized worker request" }, { status: 401 });
  }

  let payload: unknown = rawBody;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    payload = { rawBody };
  }

  const runId = findValueByKey(payload, "runId");
  const traceId = findValueByKey(payload, "traceId") || req.headers.get("x-agentflow-trace-id");

  if (runId) {
    await prisma.executionEvent.create({
      data: {
        runId,
        traceId,
        type: "QSTASH_CALLBACK_RECEIVED",
        payload: payload as Prisma.InputJsonValue,
      },
    }).catch(() => null);
  }

  return NextResponse.json({ success: true });
}
