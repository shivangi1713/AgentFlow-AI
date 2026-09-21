import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import { hasValidClerkKeys } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8">
        <header className="flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            AgentFlow AI
          </Link>
          <Link href="/sign-up" className="text-sm text-slate-300 hover:text-white">
            Create account
          </Link>
        </header>

        <section className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[1fr_420px]">
          <div className="max-w-xl">
            <p className="mb-3 text-sm font-medium uppercase tracking-[0.2em] text-cyan-300">
              Production Workflow Automation
            </p>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Sign in to manage durable AI workflows.
            </h1>
            <p className="mt-5 text-base leading-7 text-slate-300">
              Monitor executions, replay failed steps, inspect DLQ events, and publish stable workflow versions from one secure workspace.
            </p>
          </div>

          <div className="flex justify-center lg:justify-end">
            {hasValidClerkKeys() ? (
              <SignIn
                appearance={{
                  elements: {
                    rootBox: "w-full",
                    cardBox: "shadow-2xl",
                  },
                }}
                signUpUrl="/sign-up"
                forceRedirectUrl="/dashboard"
                fallbackRedirectUrl="/dashboard"
              />
            ) : (
              <div className="w-full rounded-lg border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
                Clerk keys are not configured. Add valid Clerk environment variables to enable sign-in locally.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
