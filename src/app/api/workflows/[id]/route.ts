import { NextResponse } from "next/server";
import { getWorkflow, updateWorkflowGraph } from "@/lib/workflowStore";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Failed to update workflow";
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { nodes, edges } = await req.json();
    const { id } = await params;

    const updatedWorkflow = await updateWorkflowGraph(id, nodes, edges);

    return NextResponse.json({ success: true, workflow: updatedWorkflow });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const workflow = await getWorkflow(id);

    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    return NextResponse.json({ workflow });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
