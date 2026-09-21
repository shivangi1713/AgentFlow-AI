import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isLocalDevFallbackEnabled } from "@/lib/env";
import { getTenantMonthlyUsage } from "@/lib/metering";
import { createWorkflow, listWorkflows } from "@/lib/workflowStore";

async function getCurrentUserId() {
  if (isLocalDevFallbackEnabled()) return "local-dev-user";
  const { userId } = await auth();
  return userId;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected workflow API error";
}

// 1. Fetch User's Workflows (GET /api/workflows)
export async function GET() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [workflows, usage] = await Promise.all([
      listWorkflows(userId),
      getTenantMonthlyUsage(userId),
    ]);

    return NextResponse.json({ workflows, usage });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

// 2. Create New Workflow (POST /api/workflows)
export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, description } = await req.json();

    const initialNodes = [
      { id: "node-1", type: "triggerNode", data: { label: "Manual Webhook Trigger" }, position: { x: 250, y: 50 } },
      { id: "node-2", type: "geminiNode", data: { label: "Gemini AI Task", prompt: "Summarize this input" }, position: { x: 250, y: 220 } },
    ];

    const initialEdges = [{ id: "e1-2", source: "node-1", target: "node-2", animated: true }];

    const workflow = await createWorkflow({
      userId,
      name: name || "Untitled Workflow",
      description: description || "Custom AgentFlow AI Automation",
      nodes: initialNodes,
      edges: initialEdges,
    });

    return NextResponse.json({ workflow });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
