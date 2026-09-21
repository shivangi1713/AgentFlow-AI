import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { hasValidClerkKeys } from "@/lib/env";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link href="/dashboard" className="text-sm font-bold tracking-tight text-slate-950">
            AgentFlow AI
          </Link>

          <nav className="flex items-center gap-4">
            <Link href="/dashboard" className="text-sm font-medium text-slate-600 hover:text-slate-950">
              Workflows
            </Link>
            <Link href="/dashboard/dlq" className="text-sm font-medium text-slate-600 hover:text-slate-950">
              DLQ
            </Link>
            {hasValidClerkKeys() ? (
              <UserButton
                showName
                appearance={{
                  elements: {
                    userButtonBox: "flex-row-reverse gap-2",
                    userButtonOuterIdentifier: "text-sm font-medium text-slate-700",
                  },
                }}
              />
            ) : (
              <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                Local dev
              </span>
            )}
          </nav>
        </div>
      </header>

      {children}
    </div>
  );
}
