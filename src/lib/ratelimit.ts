import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { cleanEnv, isPlaceholder } from "@/lib/env";

type LimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
};

const noopLimitResult: LimitResult = {
  success: true,
  limit: Number.POSITIVE_INFINITY,
  remaining: Number.POSITIVE_INFINITY,
  reset: Date.now(),
};

function createRedisClient() {
  const url = cleanEnv(process.env.UPSTASH_REDIS_REST_URL);
  const token = cleanEnv(process.env.UPSTASH_REDIS_REST_TOKEN);

  if (!url || !token || isPlaceholder(url) || isPlaceholder(token)) {
    return null;
  }

  return new Redis({ url, token });
}

function createNoopLimiter() {
  return {
    limit: async (): Promise<LimitResult> => noopLimitResult,
  };
}

const redis = createRedisClient();

export const webhookRatelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, "1 m"),
      analytics: true,
      prefix: "@upstash/ratelimit/webhook",
    })
  : createNoopLimiter();

export const executionRatelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(100, "1 d"),
      analytics: true,
      prefix: "@upstash/ratelimit/execution",
    })
  : createNoopLimiter();
