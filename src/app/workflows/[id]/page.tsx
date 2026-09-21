import WorkflowCanvas from "@/components/workflow/Canvas";
import { notFound } from "next/navigation";
import type { Edge, Node } from "@xyflow/react";
import { getWorkflow } from "@/lib/workflowStore";

export default async function WorkflowEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workflow = await getWorkflow(id);

  if (!workflow) return notFound();
  const latestVersion =
    "versions" in workflow && Array.isArray(workflow.versions)
      ? workflow.versions[0]?.version ?? null
      : null;

  return (
    <main className="p-6 max-w-7xl mx-auto">
      <div className="mb-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{workflow.name}</h1>
          <p className="text-sm text-slate-500">Visual Directed Acyclic Graph (DAG) Automation Editor</p>
        </div>
      </div>

      <WorkflowCanvas
        workflowId={workflow.id}
        initialNodes={workflow.nodes as unknown as Node[]}
        initialEdges={workflow.edges as unknown as Edge[]}
        initialStatus={workflow.status}
        initialPublishedVersion={latestVersion}
      />
    </main>
  );
}
