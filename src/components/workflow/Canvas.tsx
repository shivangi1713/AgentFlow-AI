"use client";

import { useState, useCallback } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Node,
  Edge,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
} from "@xyflow/react";
import { Mail, Send } from "lucide-react";
import "@xyflow/react/dist/style.css";
import { nodeTypes } from "./CustomNodes";

interface CanvasProps {
  workflowId: string;
  initialNodes?: Node[];
  initialEdges?: Edge[];
  initialStatus?: string;
  initialPublishedVersion?: number | null;
}

export default function WorkflowCanvas({
  workflowId,
  initialNodes = [],
  initialEdges = [],
  initialStatus = "DRAFT",
  initialPublishedVersion = null,
}: CanvasProps) {
  const [nodes, setNodes] = useState<Node[]>(
    initialNodes.length > 0
      ? initialNodes
      : [
          {
            id: "node-1",
            type: "triggerNode",
            data: { label: "Manual Input / Webhook Event" },
            position: { x: 250, y: 50 },
          },
          {
            id: "node-2",
            type: "geminiNode",
            data: { label: "Summarize Text & Extract Action Items", prompt: "Summarize this email in 3 bullet points." },
            position: { x: 250, y: 220 },
          },
        ]
  );

  const [edges, setEdges] = useState<Edge[]>(
    initialEdges.length > 0
      ? initialEdges
      : [{ id: "e1-2", source: "node-1", target: "node-2", animated: true }]
  );

  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [workflowStatus, setWorkflowStatus] = useState(initialStatus);
  const [publishedVersion, setPublishedVersion] = useState(initialPublishedVersion);

  const addTelegramNode = () => {
    const id = `telegram-${Date.now()}`;
    setNodes((nds) => [
      ...nds,
      {
        id,
        type: "telegramNode",
        data: { label: "Telegram Alert", chatId: "" },
        position: { x: 250, y: 400 + nds.length * 30 },
      },
    ]);
    setEdges((eds) => [...eds, { id: `e-node-2-${id}`, source: "node-2", target: id, animated: true }]);
  };

  const addEmailNode = () => {
    const id = `email-${Date.now()}`;
    setNodes((nds) => [
      ...nds,
      {
        id,
        type: "emailNode",
        data: { label: "Email Alert", toEmail: "test@example.com" },
        position: { x: 250, y: 400 + nds.length * 30 },
      },
    ]);
    setEdges((eds) => [...eds, { id: `e-node-2-${id}`, source: "node-2", target: id, animated: true }]);
  };

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect: OnConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    []
  );

  const saveWorkflow = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/workflows/${workflowId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes, edges }),
      });
      if (res.ok) {
        setWorkflowStatus("DRAFT");
        alert("Draft saved. Publish when you want production executions to use these changes.");
      }
    } catch {
      alert("Failed to save graph");
    } finally {
      setSaving(false);
    }
  };

  const publishWorkflow = async () => {
    setPublishing(true);
    try {
      const res = await fetch(`/api/workflows/${workflowId}/publish`, {
        method: "POST",
      });
      const result = await res.json();

      if (!res.ok || !result.success) {
        alert(`Publish failed: ${result.error || "Unknown error"}`);
        return;
      }

      setWorkflowStatus("ACTIVE");
      setPublishedVersion(result.version);
      alert(`Workflow published as v${result.version}`);
    } catch {
      alert("Publish request failed");
    } finally {
      setPublishing(false);
    }
  };

  const runWorkflow = async () => {
    setExecuting(true);
    try {
      const res = await fetch("/api/workflows/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowId,
          inputData: "Customer Feedback: The app crashed when I uploaded a large PDF file.",
        }),
      });
      const result = await res.json();
      if (result.success) {
        alert(
          result.queued
            ? `Workflow queued successfully!\nMessage ID: ${result.messageId}`
            : `Workflow Executed in ${result.durationMs}ms!\nCheck browser console for Gemini logs.`
        );
      } else {
        alert(`Execution Failed: ${result.error}`);
      }
    } catch {
      alert("Execution request failed");
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="w-full h-[82vh] border border-slate-200 rounded-2xl overflow-hidden relative bg-slate-50 shadow-inner">
      {/* Top Bar Container */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-3">
        <button
          onClick={addTelegramNode}
          className="px-3 py-2 bg-white text-sky-700 border border-sky-200 rounded-lg font-semibold text-xs shadow-sm hover:bg-sky-50 transition flex items-center gap-1.5"
          title="Add Telegram action node"
        >
          <Send className="w-3.5 h-3.5" />
          Telegram
        </button>

        <button
          onClick={addEmailNode}
          className="px-3 py-2 bg-white text-rose-700 border border-rose-200 rounded-lg font-semibold text-xs shadow-sm hover:bg-rose-50 transition flex items-center gap-1.5"
          title="Add Email action node"
        >
          <Mail className="w-3.5 h-3.5" />
          Email
        </button>

        {/* SUB-STEP 5.3: Webhook Endpoint Display */}
        <div className="flex items-center gap-2 bg-white/90 backdrop-blur-sm px-3 py-2 rounded-lg border border-slate-200 text-xs font-mono text-slate-700 shadow-sm">
          <span className="font-semibold text-slate-500">Webhook:</span>
          <code className="bg-slate-100 px-2 py-0.5 rounded text-indigo-600 font-bold select-all">
            POST /api/v1/webhooks/{workflowId} + HMAC headers
          </code>
        </div>

        {/* Save Button */}
        <div className="flex items-center gap-2 bg-white/90 backdrop-blur-sm px-3 py-2 rounded-lg border border-slate-200 text-xs shadow-sm">
          <span className="font-semibold text-slate-500">Published:</span>
          <span className="font-bold text-slate-800">
            {publishedVersion ? `v${publishedVersion}` : "none"}
          </span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
            workflowStatus === "ACTIVE"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-amber-50 text-amber-700 border border-amber-200"
          }`}>
            {workflowStatus}
          </span>
        </div>

        <button
          onClick={saveWorkflow}
          disabled={saving}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold text-sm shadow-md hover:bg-indigo-700 disabled:opacity-50 transition"
        >
          {saving ? "Saving Graph..." : "Save Graph State"}
        </button>

        <button
          onClick={publishWorkflow}
          disabled={publishing}
          className="px-4 py-2 bg-slate-900 text-white rounded-lg font-semibold text-sm shadow-md hover:bg-slate-800 disabled:opacity-50 transition"
        >
          {publishing ? "Publishing..." : "Publish"}
        </button>

        {/* Execute Button */}
        <button
          onClick={runWorkflow}
          disabled={executing}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-semibold text-sm shadow-md hover:bg-emerald-700 disabled:opacity-50 transition"
        >
          {executing ? "Executing Engine..." : "Run Workflow"}
        </button>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
      >
        <Background gap={20} size={1} color="#cbd5e1" />
        <Controls />
      </ReactFlow>
    </div>
  );
}
