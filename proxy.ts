import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { sessionOptions } from "@/lib/session";

const isPublicRoute = createRouteMatcher([
  "/login(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/pending-access",
  "/",
  "/api/health/db",
]);

const clerkOn = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);

const clerkProxy = clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const proxy = clerkOn
  ? clerkProxy
  : function proxy(request: NextRequest) {
      if (request.nextUrl.pathname === "/") {
        const hasSession = Boolean(request.cookies.get(sessionOptions.cookieName)?.value);
        if (!hasSession) {
          return NextResponse.redirect(new URL("/login", request.url));
        }
      }

      return NextResponse.next();
    };

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
