import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

export async function publishWorkflowVersion(workflowId: string) {
  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
    include: {
      versions: {
        orderBy: { version: "desc" },
        take: 1,
      },
    },
  });

  if (!workflow) throw new Error("Workflow not found");

  const nextVersion = (workflow.versions[0]?.version ?? 0) + 1;

  const version = await prisma.workflowVersion.create({
    data: {
      workflowId: workflow.id,
      version: nextVersion,
      nodes: workflow.nodes as Prisma.InputJsonValue,
      edges: workflow.edges as Prisma.InputJsonValue,
    },
  });

  await prisma.workflow.update({
    where: { id: workflow.id },
    data: {
      activeVersionId: version.id,
      status: "ACTIVE",
    },
  });

  return version;
}

export async function getActiveWorkflowVersion(workflowId: string) {
  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
  });

  if (!workflow) throw new Error("Workflow not found");

  if (!workflow.activeVersionId) {
    return null;
  }

  return prisma.workflowVersion.findUnique({
    where: { id: workflow.activeVersionId },
  });
}

export async function ensureActiveWorkflowVersion(workflowId: string) {
  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
    include: {
      versions: {
        orderBy: { version: "desc" },
        take: 1,
      },
    },
  });

  if (!workflow) throw new Error("Workflow not found");

  if (workflow.activeVersionId) {
    const activeVersion = await prisma.workflowVersion.findUnique({
      where: { id: workflow.activeVersionId },
    });

    if (activeVersion) return activeVersion;
  }

  const latestVersion = workflow.versions[0];
  if (latestVersion) {
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { activeVersionId: latestVersion.id },
    });

    return latestVersion;
  }

  return publishWorkflowVersion(workflow.id);
}
