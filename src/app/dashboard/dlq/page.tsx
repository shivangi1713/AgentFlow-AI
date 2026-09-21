"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, RotateCcw, Terminal } from "lucide-react";

type DlqItem = {
  eventId: string;
  runId: string;
  traceId: string | null;
  workflowId: string;
  workflowName: string;
  status: string;
  triggerPayload: unknown;
  dlqPayload: unknown;
  failedSteps: Array<{
    nodeId: string;
    nodeType: string;
    status: string;
    errorMessage: string | null;
    attemptCount: number;
    updatedAt: string;
  }>;
  recentErrors: Array<{
    type: string;
    stepId: string | null;
    payload: unknown;
    createdAt: string;
  }>;
  createdAt: string;
};

function prettyJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

export default function DlqDashboardPage() {
  const [items, setItems] = useState<DlqItem[]>([]);
  const [payloadEdits, setPayloadEdits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const loadDlq = async () => {
    setLoading(true);
    const res = await fetch("/api/runs/dlq");
    const data = await res.json();

    if (data.items) {
      setItems(data.items);
      setPayloadEdits(
        Object.fromEntries(
          data.items.map((item: DlqItem) => [item.runId, prettyJson(item.triggerPayload)])
        )
      );
    }

    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;

    fetch("/api/runs/dlq")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.items) {
          setItems(data.items);
          setPayloadEdits(
            Object.fromEntries(
              data.items.map((item: DlqItem) => [item.runId, prettyJson(item.triggerPayload)])
            )
          );
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshNonce]);

  const replayRun = async (item: DlqItem) => {
    setMessage(null);

    try {
      const payload = JSON.parse(payloadEdits[item.runId] || "{}");
      const res = await fetch(`/api/internal/runs/${item.runId}/replay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "run", triggerPayload: payload }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setMessage(data.error || "Replay failed");
        return;
      }

      setMessage(`Reingested run ${item.runId} with replay ${data.replayId}`);
      setRefreshNonce((current) => current + 1);
    } catch {
      setMessage("Payload must be valid JSON before replay.");
    }
  };

  return (
    <main className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <AlertTriangle className="w-7 h-7 text-rose-600" />
            Dead Letter Queue
          </h1>
          <p className="text-sm text-slate-500">Inspect terminal failures, edit payloads, and reingest runs.</p>
        </div>
        <button
          onClick={loadDlq}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {message && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {message}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-500">Loading DLQ entries...</div>
      ) : items.length === 0 ? (
        <div className="border-2 border-dashed rounded-xl p-12 text-center bg-slate-50">
          <p className="text-slate-700 font-semibold">No dead-lettered runs found</p>
          <p className="text-sm text-slate-500 mt-1">That quiet board is exactly what we want before launch.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {items.map((item) => (
            <section key={item.eventId} className="border rounded-xl bg-white shadow-sm overflow-hidden">
              <div className="p-5 border-b flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="font-bold text-slate-900">{item.workflowName}</h2>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-semibold">
                      {item.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-mono">run: {item.runId}</p>
                  <p className="text-xs text-slate-500 font-mono">trace: {item.traceId || "not recorded"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/dashboard/executions?workflowId=${item.workflowId}`}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    Run Trace
                  </Link>
                  <button
                    onClick={() => replayRun(item)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reingest
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
                <div className="p-5 border-b lg:border-b-0 lg:border-r">
                  <h3 className="text-sm font-bold text-slate-800 mb-3">Editable trigger payload</h3>
                  <textarea
                    value={payloadEdits[item.runId] || ""}
                    onChange={(event) =>
                      setPayloadEdits((current) => ({
                        ...current,
                        [item.runId]: event.target.value,
                      }))
                    }
                    className="w-full h-64 rounded-lg border border-slate-200 bg-slate-950 p-3 font-mono text-xs text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="p-5">
                  <h3 className="text-sm font-bold text-slate-800 mb-3">Failure details</h3>
                  <div className="space-y-3">
                    {item.failedSteps.map((step) => (
                      <div key={step.nodeId} className="rounded-lg border bg-slate-50 p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-slate-800">{step.nodeId}</span>
                          <span className="text-[10px] font-semibold text-rose-700">{step.status}</span>
                        </div>
                        <p className="text-xs text-slate-500">{step.nodeType}</p>
                        <p className="mt-2 text-xs text-rose-700 whitespace-pre-wrap">
                          {step.errorMessage || "No step error captured"}
                        </p>
                      </div>
                    ))}
                    <pre className="max-h-48 overflow-auto rounded-lg border bg-slate-950 p-3 text-xs text-slate-200">
                      {prettyJson(item.recentErrors.length ? item.recentErrors : item.dlqPayload)}
                    </pre>
                  </div>
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
