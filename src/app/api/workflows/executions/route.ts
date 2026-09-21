import { NextResponse } from "next/server";
import { listExecutions } from "@/lib/workflowStore";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const workflowId = searchParams.get("workflowId");

  if (!workflowId) {
    return NextResponse.json({ error: "workflowId is required" }, { status: 400 });
  }

  const executions = await listExecutions(workflowId);

  return NextResponse.json({ executions });
}
