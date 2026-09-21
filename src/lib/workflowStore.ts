import { promises as fs } from "fs";
import path from "path";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { cleanEnv } from "@/lib/env";

type WorkflowRecord = {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  nodes: unknown;
  edges: unknown;
  status: "DRAFT" | "ACTIVE" | "PAUSED";
  webhookSecret: string;
  activeVersionId?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type LocalStore = {
  workflows: WorkflowRecord[];
};

const storePath = path.join(process.cwd(), ".agentflow-local-store.json");

function shouldUseLocalStore() {
  const databaseUrl = cleanEnv(process.env.DATABASE_URL);
  return process.env.NODE_ENV !== "production" && (!databaseUrl || databaseUrl.includes("ep-xyz"));
}

function reviveDate(value: unknown) {
  return typeof value === "string" || typeof value === "number" || value instanceof Date
    ? new Date(value)
    : value;
}

function reviveDates<T extends Record<string, unknown>>(record: T): T {
  return {
    ...record,
    createdAt: record.createdAt ? reviveDate(record.createdAt) : record.createdAt,
    updatedAt: record.updatedAt ? reviveDate(record.updatedAt) : record.updatedAt,
    startedAt: record.startedAt ? reviveDate(record.startedAt) : record.startedAt,
    endedAt: record.endedAt ? reviveDate(record.endedAt) : record.endedAt,
  };
}

async function readLocalStore(): Promise<LocalStore> {
  try {
    const raw = await fs.readFile(storePath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      workflows: ((parsed.workflows || []) as Array<Record<string, unknown>>).map(
        (record) => reviveDates(record) as unknown as WorkflowRecord
      ),
    };
  } catch {
    return { workflows: [] };
  }
}

async function writeLocalStore(store: LocalStore) {
  await fs.writeFile(storePath, JSON.stringify(store, null, 2), "utf8");
}

function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function listWorkflows(userId: string) {
  if (!shouldUseLocalStore()) {
    return prisma.workflow.findMany({
      where: { userId },
      include: {
        versions: {
          orderBy: { version: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  const store = await readLocalStore();
  return store.workflows
    .filter((workflow) => workflow.userId === userId)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

export async function createWorkflow(input: {
  userId: string;
  name: string;
  description: string;
  nodes: unknown;
  edges: unknown;
}) {
  if (!shouldUseLocalStore()) {
    return prisma.workflow.create({
      data: {
        userId: input.userId,
        name: input.name,
        description: input.description,
        nodes: input.nodes as Prisma.InputJsonValue,
        edges: input.edges as Prisma.InputJsonValue,
        status: "DRAFT",
      },
    });
  }

  const store = await readLocalStore();
  const now = new Date();
  const workflow: WorkflowRecord = {
    id: createId("wf"),
    userId: input.userId,
    name: input.name,
    description: input.description,
    nodes: input.nodes,
    edges: input.edges,
    status: "DRAFT",
    webhookSecret: createId("secret"),
    createdAt: now,
    updatedAt: now,
  };

  store.workflows.unshift(workflow);
  await writeLocalStore(store);
  return workflow;
}

export async function getWorkflow(id: string) {
  if (!shouldUseLocalStore()) {
    return prisma.workflow.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { version: "desc" },
          take: 1,
        },
      },
    });
  }

  const store = await readLocalStore();
  return store.workflows.find((workflow) => workflow.id === id) ?? null;
}

export async function updateWorkflowGraph(
  id: string,
  nodes: unknown,
  edges: unknown
) {
  if (!shouldUseLocalStore()) {
    return prisma.workflow.update({
      where: { id },
      data: {
        nodes: nodes as Prisma.InputJsonValue,
        edges: edges as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });
  }

  const store = await readLocalStore();
  const workflow = store.workflows.find((item) => item.id === id);
  if (!workflow) throw new Error("Workflow not found");

  workflow.nodes = nodes;
  workflow.edges = edges;
  workflow.updatedAt = new Date();
  await writeLocalStore(store);
  return workflow;
}

export async function listExecutions(workflowId: string) {
  if (!shouldUseLocalStore()) {
    const runs = await prisma.executionRun.findMany({
      where: { workflowId },
      include: {
        steps: {
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return runs.map((run) => ({
      id: run.id,
      workflowId: run.workflowId,
      status: run.status === "SUCCEEDED" ? "COMPLETED" : run.status,
      inputData: JSON.stringify(run.triggerPayload, null, 2),
      logs: run.steps.map((step) => ({
        nodeId: step.nodeId,
        nodeType: step.nodeType,
        status: step.status,
        output: step.outputData
          ? typeof step.outputData === "string"
            ? step.outputData
            : JSON.stringify(step.outputData, null, 2)
          : step.errorMessage || "",
        durationMs: step.durationMs || 0,
      })),
      durationMs: run.durationMs,
      startedAt: run.startedAt || run.createdAt,
      endedAt: run.endedAt,
    }));
  }

  return [];
}
