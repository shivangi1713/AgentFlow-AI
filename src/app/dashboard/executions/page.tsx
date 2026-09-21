"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ReactFlow, Background, Controls, Edge, Node } from "@xyflow/react";
import { Clock, CheckCircle, RotateCcw, Terminal, XCircle } from "lucide-react";
import "@xyflow/react/dist/style.css";
import { nodeTypes } from "@/components/workflow/CustomNodes";

interface ExecutionRunSummary {
  id: string;
  status: string;
  durationMs: number;
  startedAt: string;
  logs: Array<{
    nodeId: string;
    nodeType: string;
    status: string;
    output: string;
    durationMs: number;
  }>;
}

interface WorkflowGraph {
  nodes: Node[];
  edges: Edge[];
}

type StreamEvent = {
  type: string;
  stepId?: string | null;
  payload?: {
    nodeId?: string;
    nodeType?: string;
    durationMs?: number;
    error?: string;
  };
};

function statusFromEvent(type: string) {
  if (type === "STEP_STARTED") return "RUNNING";
  if (type === "STEP_SUCCEEDED") return "SUCCEEDED";
  if (type === "STEP_RETRYING") return "RETRYING";
  if (type === "CIRCUIT_OPEN") return "RETRYING";
  if (type === "DLQ_CREATED" || type === "RUN_FAILED") return "FAILED";
  return null;
}

function applyStreamEvent(run: ExecutionRunSummary, event: StreamEvent): ExecutionRunSummary {
  const nodeId = event.payload?.nodeId || event.stepId;
  const status = statusFromEvent(event.type);

  if (!nodeId || !status) return run;

  const existingStep = run.logs.find((step) => step.nodeId === nodeId);
  const nextStep = {
    nodeId,
    nodeType: existingStep?.nodeType || event.payload?.nodeType || "default",
    status,
    output: event.payload?.error || existingStep?.output || "",
    durationMs: event.payload?.durationMs || existingStep?.durationMs || 0,
  };

  return {
    ...run,
    status: event.type === "RUN_FAILED" || event.type === "DLQ_CREATED" ? "FAILED" : run.status,
    logs: existingStep
      ? run.logs.map((step) => (step.nodeId === nodeId ? { ...step, ...nextStep } : step))
      : [...run.logs, nextStep],
  };
}

function ExecutionsHistoryContent() {
  const searchParams = useSearchParams();
  const workflowId = searchParams.get("workflowId");
  const [logs, setLogs] = useState<ExecutionRunSummary[]>([]);
  const [selectedLog, setSelectedLog] = useState<ExecutionRunSummary | null>(null);
  const [workflowGraph, setWorkflowGraph] = useState<WorkflowGraph | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    if (!workflowId) return;

    fetch(`/api/workflows/executions?workflowId=${workflowId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.executions) return;

        setLogs(data.executions);
        setSelectedLog((current) => {
          if (!data.executions.length) return null;
          return data.executions.find((execution: ExecutionRunSummary) => execution.id === current?.id) || data.executions[0];
        });
      });
  }, [refreshNonce, workflowId]);

  useEffect(() => {
    if (!workflowId) return;

    fetch(`/api/workflows/${workflowId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.workflow) {
          setWorkflowGraph({
            nodes: data.workflow.nodes || [],
            edges: data.workflow.edges || [],
          });
        }
      })
      .catch(() => setWorkflowGraph(null));
  }, [workflowId]);

  useEffect(() => {
    if (!selectedLog?.id) return;

    const source = new EventSource(`/api/runs/${selectedLog.id}/stream`);

    source.addEventListener("execution-event", (message) => {
      const event = JSON.parse(message.data) as StreamEvent;

      setSelectedLog((current) => (current?.id === selectedLog.id ? applyStreamEvent(current, event) : current));
      setLogs((current) =>
        current.map((run) => (run.id === selectedLog.id ? applyStreamEvent(run, event) : run))
      );
    });

    source.addEventListener("run-status", (message) => {
      const event = JSON.parse(message.data) as { status?: string };
      if (!event.status) return;

      const normalizedStatus = event.status === "SUCCEEDED" ? "COMPLETED" : event.status;
      setSelectedLog((current) =>
        current?.id === selectedLog.id ? { ...current, status: normalizedStatus } : current
      );
      setLogs((current) =>
        current.map((run) => (run.id === selectedLog.id ? { ...run, status: normalizedStatus } : run))
      );
    });

    source.onerror = () => {
      source.close();
    };

    return () => source.close();
  }, [selectedLog?.id]);

  const tracedNodes = useMemo(() => {
    if (!workflowGraph) return [];

    const statusByNode = new Map(selectedLog?.logs.map((step) => [step.nodeId, step.status]) || []);

    return workflowGraph.nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        stepStatus: statusByNode.get(node.id),
      },
    }));
  }, [selectedLog, workflowGraph]);

  const handleReplay = async (runId: string, nodeId?: string) => {
    setNotice(null);

    try {
      const res = await fetch(`/api/internal/runs/${runId}/replay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nodeId ? { nodeId } : { mode: "run" }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setNotice(data.error || "Failed to trigger replay");
        return;
      }

      setNotice(nodeId ? `Replaying node ${nodeId}` : "Replaying workflow from root");
      setRefreshNonce((current) => current + 1);
    } catch {
      setNotice("Replay request failed");
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Left Column: Execution Runs List */}
      <div className="lg:col-span-1 border rounded-xl bg-white p-4 shadow-sm">
        <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-indigo-600" />
          Execution Runs
        </h2>

        <div className="space-y-3">
          {logs.map((run) => (
            <div
              key={run.id}
              onClick={() => setSelectedLog(run)}
              className={`p-3 rounded-lg border cursor-pointer transition ${
                selectedLog?.id === run.id ? "border-indigo-500 bg-indigo-50/50" : "hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="flex items-center gap-1.5 text-xs font-bold">
                  {run.status === "COMPLETED" ? (
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-rose-500" />
                  )}
                  {run.status}
                </span>
                <span className="text-[10px] text-slate-400">{run.durationMs}ms</span>
              </div>
              <p className="text-[11px] text-slate-500">{new Date(run.startedAt).toLocaleString()}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right Column: Detailed Node Inspector Drawer */}
      <div className="lg:col-span-2 space-y-6">
        {notice && (
          <div className="border border-amber-200 bg-amber-50 text-amber-800 rounded-lg px-4 py-3 text-sm">
            {notice}
          </div>
        )}

        <div className="border rounded-xl bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-indigo-500" />
              Durable Run Trace
            </h3>
            {selectedLog && (
              <button
                onClick={() => handleReplay(selectedLog.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-50 text-amber-700 border border-amber-300 rounded hover:bg-amber-100"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Replay Run
              </button>
            )}
          </div>
          <div className="h-[360px] bg-slate-50">
            {workflowGraph ? (
              <ReactFlow
                nodes={tracedNodes}
                edges={workflowGraph.edges}
                nodeTypes={nodeTypes}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
                fitView
              >
                <Background gap={20} size={1} color="#cbd5e1" />
                <Controls showInteractive={false} />
              </ReactFlow>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                Workflow graph unavailable
              </div>
            )}
          </div>
        </div>

        <div className="border rounded-xl bg-slate-900 text-slate-100 p-6 shadow-md font-mono">
          <h3 className="text-sm font-bold text-slate-400 mb-4 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            Step-by-Step Execution Output
          </h3>

          {selectedLog ? (
            <div className="space-y-4">
              {selectedLog.logs.map((step, idx) => (
                <div key={`${step.nodeId}-${idx}`} className="border border-slate-800 rounded-lg p-4 bg-slate-950/60">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <span className="text-xs font-bold text-indigo-400">
                      Node [{step.nodeId}] - <span className="text-slate-300">{step.nodeType}</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                        {step.status} ({step.durationMs || 0}ms)
                      </span>
                      <button
                        onClick={() => handleReplay(selectedLog.id, step.nodeId)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[10px] bg-amber-50 text-amber-700 border border-amber-300 rounded hover:bg-amber-100"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Replay Step
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-slate-300 whitespace-pre-wrap bg-slate-900 p-3 rounded border border-slate-800 mt-2">
                    {step.output}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-slate-600 text-xs py-12 text-center">Select an execution run to view step outputs</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ExecutionsHistoryPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-500">Loading execution history...</div>}>
      <ExecutionsHistoryContent />
    </Suspense>
  );
}
