export const STEP_STATUS_STYLES: Record<string, string> = {
  PENDING: "border-slate-300 bg-white",
  READY: "border-sky-400 bg-sky-50/30 ring-1 ring-sky-300",
  RUNNING: "border-blue-500 bg-blue-50/50 animate-pulse ring-2 ring-blue-400",
  SUCCEEDED: "border-emerald-500 bg-emerald-50/30 ring-1 ring-emerald-500",
  SUCCESS: "border-emerald-500 bg-emerald-50/30 ring-1 ring-emerald-500",
  FAILED: "border-rose-500 bg-rose-50/30 ring-2 ring-rose-500",
  RETRYING: "border-amber-500 bg-amber-50/30 ring-1 ring-amber-500",
  SKIPPED: "border-slate-400 bg-slate-50/40",
};

export function getStepStatusStyle(status?: string, fallback = "border-slate-300 bg-white") {
  return status ? STEP_STATUS_STYLES[status] || fallback : fallback;
}
