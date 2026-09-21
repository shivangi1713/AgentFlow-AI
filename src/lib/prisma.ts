import { PrismaClient } from "@prisma/client";
import { cleanEnv } from "./env";

function assertServerlessRuntimeDatabaseUrl() {
  if (process.env.NODE_ENV !== "production") return;

  const databaseUrl = cleanEnv(process.env.DATABASE_URL);
  if (!databaseUrl || !databaseUrl.includes(".neon.tech")) return;

  if (!databaseUrl.includes("-pooler.")) {
    throw new Error("DATABASE_URL must use Neon's pooled -pooler endpoint in production serverless runtimes.");
  }
}

const prismaClientSingleton = () => {
  assertServerlessRuntimeDatabaseUrl();

  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
};

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>;
}

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

export default prisma;

if (process.env.NODE_ENV !== "production") globalThis.prismaGlobal = prisma;
