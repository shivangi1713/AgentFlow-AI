import prisma from "@/lib/prisma";

export const FREE_TIER_RUN_LIMIT = 500;

export function getStartOfCurrentMonth() {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  return startOfMonth;
}

export async function getTenantMonthlyUsage(userId: string) {
  const runCount = await prisma.executionRun.count({
    where: {
      userId,
      createdAt: { gte: getStartOfCurrentMonth() },
    },
  });

  return {
    runCount,
    limit: FREE_TIER_RUN_LIMIT,
    remaining: Math.max(FREE_TIER_RUN_LIMIT - runCount, 0),
    percentUsed: Math.min(Math.round((runCount / FREE_TIER_RUN_LIMIT) * 100), 100),
  };
}

export async function checkTenantQuota(userId: string) {
  const usage = await getTenantMonthlyUsage(userId);

  return {
    allowed: usage.runCount < FREE_TIER_RUN_LIMIT,
    usage: usage.runCount,
    limit: usage.limit,
    remaining: usage.remaining,
    percentUsed: usage.percentUsed,
  };
}
