import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import { isLocalDevFallbackEnabled } from "@/lib/env";
import { publishWorkflowVersion } from "@/lib/workflowVersions";

async function getCurrentUserId() {
  if (isLocalDevFallbackEnabled()) return "local-dev-user";
  const { userId } = await auth();
  return userId;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Failed to publish workflow";
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const workflow = await prisma.workflow.findFirst({
      where: { id, userId },
      select: { id: true },
    });

    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    const version = await publishWorkflowVersion(workflow.id);

    return NextResponse.json({
      success: true,
      workflowId: workflow.id,
      workflowVersionId: version.id,
      version: version.version,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
