import { Redis } from "@upstash/redis";
import { cleanEnv, isPlaceholder } from "@/lib/env";

const FAILURE_THRESHOLD = 5;
const COOLDOWN_SECONDS = 300;

type CircuitState = "OPEN" | null;

export type CircuitBreakerStore = {
  incrementFailures(provider: string): Promise<number>;
  openCircuit(provider: string, ttlSeconds: number): Promise<void>;
  getCircuitState(provider: string): Promise<CircuitState>;
  reset(provider: string): Promise<void>;
};

function createRedisClient() {
  const url = cleanEnv(process.env.UPSTASH_REDIS_REST_URL);
  const token = cleanEnv(process.env.UPSTASH_REDIS_REST_TOKEN);

  if (!url || !token || isPlaceholder(url) || isPlaceholder(token)) {
    return null;
  }

  return new Redis({ url, token });
}

const redis = createRedisClient();

function createRedisCircuitBreakerStore(): CircuitBreakerStore | null {
  if (!redis) return null;

  return {
    async incrementFailures(provider) {
      const failuresKey = `circuit:${provider}:failures`;
      const failures = await redis.incr(failuresKey);

      if (failures === 1) {
        await redis.expire(failuresKey, COOLDOWN_SECONDS);
      }

      return failures;
    },
    async openCircuit(provider, ttlSeconds) {
      await redis.set(`circuit:${provider}:state`, "OPEN", { ex: ttlSeconds });
    },
    async getCircuitState(provider) {
      const state = await redis.get<string>(`circuit:${provider}:state`);
      return state === "OPEN" ? "OPEN" : null;
    },
    async reset(provider) {
      await redis.del(`circuit:${provider}:failures`);
      await redis.del(`circuit:${provider}:state`);
    },
  };
}

export function createMemoryCircuitBreakerStore(): CircuitBreakerStore {
  const failuresByProvider = new Map<string, number>();
  const openProviders = new Set<string>();

  return {
    async incrementFailures(provider) {
      const failures = (failuresByProvider.get(provider) || 0) + 1;
      failuresByProvider.set(provider, failures);
      return failures;
    },
    async openCircuit(provider) {
      openProviders.add(provider);
    },
    async getCircuitState(provider) {
      return openProviders.has(provider) ? "OPEN" : null;
    },
    async reset(provider) {
      failuresByProvider.delete(provider);
      openProviders.delete(provider);
    },
  };
}

export function createCircuitBreaker(store: CircuitBreakerStore | null) {
  return {
    async recordProviderFailure(provider: string) {
      if (!store) return;

      const failures = await store.incrementFailures(provider);
      if (failures >= FAILURE_THRESHOLD) {
        await store.openCircuit(provider, COOLDOWN_SECONDS);
      }
    },
    async isCircuitOpen(provider: string) {
      if (!store) return false;

      return (await store.getCircuitState(provider)) === "OPEN";
    },
    async resetCircuit(provider: string) {
      if (!store) return;

      await store.reset(provider);
    },
  };
}

const defaultCircuitBreaker = createCircuitBreaker(createRedisCircuitBreakerStore());

export function getCircuitProvider(nodeType?: string) {
  if (nodeType === "geminiNode") return "geminiNode";
  if (nodeType === "telegramNode") return "telegramNode";
  if (nodeType === "emailNode") return "emailNode";
  return null;
}

export async function recordProviderFailure(provider: string) {
  await defaultCircuitBreaker.recordProviderFailure(provider);
}

export async function isCircuitOpen(provider: string) {
  return defaultCircuitBreaker.isCircuitOpen(provider);
}

export async function resetCircuit(provider: string) {
  await defaultCircuitBreaker.resetCircuit(provider);
}
