"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Eye, Cpu, CheckCircle2 } from "lucide-react";

interface Workflow {
  id: string;
  name: string;
  description: string;
  status: string;
  versions?: Array<{ version: number }>;
  updatedAt: string;
}

interface UsageSummary {
  runCount: number;
  limit: number;
  remaining: number;
  percentUsed: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/workflows")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.workflows) setWorkflows(data.workflows);
        if (data.usage) setUsage(data.usage);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const createNewWorkflow = async () => {
    const res = await fetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Email Processing Workflow" }),
    });

    const data = await res.json();
    if (data.workflow) {
      router.push(`/workflows/${data.workflow.id}`);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Cpu className="w-7 h-7 text-indigo-600" />
            AgentFlow AI Dashboard
          </h1>
          <p className="text-sm text-slate-500">Manage, run, and monitor your visual DAG workflows</p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/dlq"
            className="flex items-center gap-2 border bg-white text-slate-700 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-50 shadow-sm transition"
          >
            DLQ
          </Link>
          <button
            onClick={createNewWorkflow}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            Create New Workflow
          </button>
        </div>
      </div>

      {usage && (
        <div className="mb-8 border rounded-xl bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Monthly execution quota</h2>
              <p className="text-xs text-slate-500">
                {usage.runCount} of {usage.limit} runs used this month
              </p>
            </div>
            <span className="text-xs font-semibold text-slate-600">{usage.remaining} remaining</span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                usage.percentUsed >= 90 ? "bg-rose-500" : usage.percentUsed >= 70 ? "bg-amber-500" : "bg-indigo-600"
              }`}
              style={{ width: `${usage.percentUsed}%` }}
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading workflows...</div>
      ) : workflows.length === 0 ? (
        <div className="border-2 border-dashed rounded-xl p-12 text-center bg-slate-50">
          <p className="text-slate-600 font-medium mb-3">No workflows created yet</p>
          <button onClick={createNewWorkflow} className="text-indigo-600 font-semibold hover:underline text-sm">
            + Create your first workflow
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {workflows.map((wf) => (
            <div key={wf.id} className="bg-white border rounded-xl p-5 shadow-sm hover:shadow-md transition">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> {wf.status}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-indigo-600">
                    {wf.versions?.[0]?.version ? `v${wf.versions[0].version}` : "unpublished"}
                  </span>
                  <span className="text-[11px] text-slate-400">{new Date(wf.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>

              <h2 className="text-base font-bold text-slate-800 mb-1">{wf.name}</h2>
              <p className="text-xs text-slate-500 mb-6 line-clamp-2">{wf.description}</p>

              <div className="flex items-center gap-2 pt-3 border-t">
                <Link
                  href={`/workflows/${wf.id}`}
                  className="flex-1 text-center bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold py-2 rounded-lg transition"
                >
                  Edit Canvas
                </Link>
                <Link
                  href={`/dashboard/executions?workflowId=${wf.id}`}
                  className="p-2 border rounded-lg text-slate-600 hover:bg-slate-50"
                  title="View Execution History"
                >
                  <Eye className="w-4 h-4" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
