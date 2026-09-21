import { Client, Receiver } from "@upstash/qstash";
import { cleanEnv, isPlaceholder } from "@/lib/env";

type QstashDuration = `${bigint}${"s" | "m" | "h" | "d"}` | number;
type PublishFlowControl =
  | {
      key: string;
      parallelism: number;
      rate?: number;
      period?: QstashDuration;
    }
  | {
      key: string;
      parallelism?: number;
      rate: number;
      period?: QstashDuration;
    };

const qstashToken = cleanEnv(process.env.QSTASH_TOKEN);
const currentSigningKey = cleanEnv(process.env.QSTASH_CURRENT_SIGNING_KEY);
const nextSigningKey = cleanEnv(process.env.QSTASH_NEXT_SIGNING_KEY);

export const qstash =
  qstashToken && !isPlaceholder(qstashToken) ? new Client({ token: qstashToken }) : null;

const receiver =
  (currentSigningKey && nextSigningKey) || process.env.QSTASH_DEV
    ? new Receiver({
        currentSigningKey,
        nextSigningKey,
        devMode: process.env.QSTASH_DEV === "true" ? true : undefined,
      })
    : null;

export function getRequestBaseUrl(req: Request) {
  const configuredAppUrl = cleanEnv(process.env.NEXT_PUBLIC_APP_URL);
  if (configuredAppUrl && !isPlaceholder(configuredAppUrl)) {
    return configuredAppUrl.replace(/\/$/, "");
  }

  const forwardedProto = req.headers.get("x-forwarded-proto");
  const forwardedHost = req.headers.get("x-forwarded-host");
  const host = forwardedHost || req.headers.get("host") || "localhost:3000";
  const protocol = forwardedProto || (host.includes("localhost") ? "http" : "https");

  return `${protocol}://${host}`;
}

export function canBypassQstashSignature(req: Request) {
  const host = req.headers.get("host") || "";
  return process.env.NODE_ENV !== "production" && host.includes("localhost");
}

export async function verifyQstashSignature(req: Request, rawBody: string) {
  if (canBypassQstashSignature(req)) return true;
  if (!receiver) return false;

  const signature = req.headers.get("upstash-signature");
  if (!signature) return false;

  return receiver
    .verify({
      signature,
      body: rawBody,
      url: req.url,
      upstashRegion: req.headers.get("upstash-region") || undefined,
      clockTolerance: 30,
    })
    .catch(() => false);
}

export async function publishJsonOrFetch(input: {
  req: Request;
  url: string;
  body: unknown;
  deduplicationId: string;
  retries?: number;
  failureCallback?: string;
  timeout?: number;
  flowControl?: PublishFlowControl;
  label?: string | string[];
  traceId?: string | null;
}) {
  const headers = {
    "Content-Type": "application/json",
    ...(input.traceId ? { "x-agentflow-trace-id": input.traceId } : {}),
  };

  if (!qstash || input.url.includes("localhost")) {
    const response = await fetch(input.url, {
      method: "POST",
      headers,
      body: JSON.stringify(input.body),
    });

    return {
      messageId: `local-${Date.now()}`,
      local: true,
      ok: response.ok,
      status: response.status,
    };
  }

  return qstash.publishJSON({
    url: input.url,
    body: input.body,
    headers,
    retries: input.retries ?? 3,
    retryDelay: "1000 * pow(2, retried)",
    deduplicationId: input.deduplicationId,
    failureCallback: input.failureCallback,
    timeout: input.timeout,
    flowControl: input.flowControl,
    label: input.label,
    redact: { body: true },
  });
}
