"use client";

import React, { memo } from "react";
import { Handle, Position, NodeProps, useReactFlow } from "@xyflow/react";
import { Play, Bot, Send, Mail } from "lucide-react";
import { getStepStatusStyle } from "@/lib/nodeStyles";

function getStepStatus(data: NodeProps["data"]) {
  return typeof data.stepStatus === "string" ? data.stepStatus : undefined;
}

function StepStatusBadge({ status }: { status?: string }) {
  if (!status) return null;

  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase bg-white border border-slate-200 text-slate-600">
      {status}
    </span>
  );
}

// 1. Trigger Node (Editable Event Title)
export const TriggerNode = memo(({ id, data }: NodeProps) => {
  const { updateNodeData } = useReactFlow();
  const stepStatus = getStepStatus(data);

  return (
    <div className={`border-2 rounded-xl p-3 shadow-md min-w-[240px] ${getStepStatusStyle(stepStatus, "bg-white border-emerald-500")}`}>
      <div className="flex items-center justify-between gap-3 text-emerald-600 font-bold text-sm mb-2">
        <div className="flex items-center gap-2">
          <Play className="w-4 h-4 fill-emerald-500" />
          <span>Trigger Node</span>
        </div>
        <StepStatusBadge status={stepStatus} />
      </div>

      <label className="text-[10px] text-slate-400 font-medium block mb-1">Event Name:</label>
      <input
        type="text"
        value={(data.label as string) || ""}
        onChange={(e) => updateNodeData(id, { label: e.target.value })}
        placeholder="e.g. Incoming Webhook"
        className="w-full text-xs p-1.5 border border-slate-200 rounded bg-slate-50 font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
      />

      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-emerald-500" />
    </div>
  );
});
TriggerNode.displayName = "TriggerNode";

// 2. Gemini AI Node (Editable Prompt & Label)
export const GeminiNode = memo(({ id, data }: NodeProps) => {
  const { updateNodeData } = useReactFlow();
  const stepStatus = getStepStatus(data);

  return (
    <div className={`border-2 rounded-xl p-3 shadow-md min-w-[280px] ${getStepStatusStyle(stepStatus, "bg-white border-indigo-500")}`}>
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-indigo-500" />

      <div className="flex items-center justify-between gap-3 text-indigo-600 font-bold text-sm mb-2">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4" />
          <span>Gemini AI Agent</span>
        </div>
        <StepStatusBadge status={stepStatus} />
      </div>

      {/* Node Title Input */}
      <label className="text-[10px] text-slate-400 font-medium block mb-1">Task Name:</label>
      <input
        type="text"
        value={(data.label as string) || ""}
        onChange={(e) => updateNodeData(id, { label: e.target.value })}
        placeholder="e.g. Summarize Email"
        className="w-full text-xs font-semibold p-1.5 border border-slate-200 rounded bg-slate-50 mb-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />

      {/* Live Prompt Input Textarea */}
      <label className="text-[10px] text-slate-400 font-medium block mb-1">Gemini Prompt Instruction:</label>
      <textarea
        value={(data.prompt as string) || ""}
        onChange={(e) => updateNodeData(id, { prompt: e.target.value })}
        placeholder="Type instruction (e.g. Summarize in 3 bullets)..."
        rows={3}
        className="w-full text-xs p-2 border border-slate-200 rounded bg-slate-50 font-mono text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
      />

      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-indigo-500" />
    </div>
  );
});
GeminiNode.displayName = "GeminiNode";

// 3. Telegram Action Node
export const TelegramNode = memo(({ id, data }: NodeProps) => {
  const { updateNodeData } = useReactFlow();
  const stepStatus = getStepStatus(data);

  return (
    <div className={`border-2 rounded-xl p-3 shadow-md min-w-[260px] ${getStepStatusStyle(stepStatus, "bg-white border-sky-500")}`}>
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-sky-500" />

      <div className="flex items-center justify-between gap-3 text-sky-600 font-bold text-sm mb-2">
        <div className="flex items-center gap-2">
          <Send className="w-4 h-4" />
          <span>Telegram Alert</span>
        </div>
        <StepStatusBadge status={stepStatus} />
      </div>

      <label className="text-[10px] text-slate-400 font-medium block mb-1">Chat ID / Channel:</label>
      <input
        type="text"
        value={(data.chatId as string) || ""}
        onChange={(e) => updateNodeData(id, { chatId: e.target.value })}
        placeholder="e.g. @my_channel or 1234567"
        className="w-full text-xs p-1.5 border border-slate-200 rounded bg-slate-50 font-mono text-slate-700 focus:outline-none focus:ring-1 focus:ring-sky-500"
      />

      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-sky-500" />
    </div>
  );
});
TelegramNode.displayName = "TelegramNode";

// 4. Email Action Node
export const EmailNode = memo(({ id, data }: NodeProps) => {
  const { updateNodeData } = useReactFlow();
  const stepStatus = getStepStatus(data);

  return (
    <div className={`border-2 rounded-xl p-3 shadow-md min-w-[260px] ${getStepStatusStyle(stepStatus, "bg-white border-rose-500")}`}>
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-rose-500" />

      <div className="flex items-center justify-between gap-3 text-rose-600 font-bold text-sm mb-2">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4" />
          <span>Send Email Node</span>
        </div>
        <StepStatusBadge status={stepStatus} />
      </div>

      <label className="text-[10px] text-slate-400 font-medium block mb-1">Recipient Email:</label>
      <input
        type="email"
        value={(data.toEmail as string) || ""}
        onChange={(e) => updateNodeData(id, { toEmail: e.target.value })}
        placeholder="user@example.com"
        className="w-full text-xs p-1.5 border border-slate-200 rounded bg-slate-50 font-mono text-slate-700 focus:outline-none focus:ring-1 focus:ring-rose-500"
      />

      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-rose-500" />
    </div>
  );
});
EmailNode.displayName = "EmailNode";

// Export all registered node types
export const nodeTypes = {
  triggerNode: TriggerNode,
  geminiNode: GeminiNode,
  telegramNode: TelegramNode,
  emailNode: EmailNode,
};
