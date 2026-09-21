import { NextFetchEvent, NextRequest, NextResponse } from "next/server";
import { isLocalDevFallbackEnabled } from "@/lib/env";

function isPublicRoute(pathname: string) {
  return pathname.startsWith("/api/v1/webhooks") || pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up");
}

export async function proxy(req: NextRequest, event: NextFetchEvent) {
  if (isLocalDevFallbackEnabled()) return NextResponse.next();

  const { clerkMiddleware } = await import("@clerk/nextjs/server");
  const handler = clerkMiddleware(async (auth, clerkReq) => {
    if (!isPublicRoute(clerkReq.nextUrl.pathname)) await auth.protect();
  });

  return handler(req, event);
}

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpeg|jpg|png|gif|svg|ttf|woff2?|ico|csv|docx|xlsx|zip|webmanifest)).*)", "/(api|trpc)(.*)"],
};
