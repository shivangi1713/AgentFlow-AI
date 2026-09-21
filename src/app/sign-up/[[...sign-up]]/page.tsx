import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { hasValidClerkKeys } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function SignUpPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8">
        <header className="flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            AgentFlow AI
          </Link>
          <Link href="/sign-in" className="text-sm text-slate-300 hover:text-white">
            Sign in
          </Link>
        </header>

        <section className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[1fr_420px]">
          <div className="max-w-xl">
            <p className="mb-3 text-sm font-medium uppercase tracking-[0.2em] text-cyan-300">
              Start Building
            </p>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Create your AgentFlow AI workspace.
            </h1>
            <p className="mt-5 text-base leading-7 text-slate-300">
              Build versioned DAG workflows, process events through QStash, and observe every durable execution step in real time.
            </p>
          </div>

          <div className="flex justify-center lg:justify-end">
            {hasValidClerkKeys() ? (
              <SignUp
                appearance={{
                  elements: {
                    rootBox: "w-full",
                    cardBox: "shadow-2xl",
                  },
                }}
                signInUrl="/sign-in"
                forceRedirectUrl="/dashboard"
                fallbackRedirectUrl="/dashboard"
              />
            ) : (
              <div className="w-full rounded-lg border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
                Clerk keys are not configured. Add valid Clerk environment variables to enable sign-up locally.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
