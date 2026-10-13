import { type NextRequest, NextResponse } from "next/server";
import { safeReturnPath } from "@/lib/auth-redirect";
import { PUBLIC_ROUTES } from "@/lib/site";

// Next 16 renamed the `middleware` convention to `proxy`. These redirects are a UX/perf
// optimization — bounce signed-out users to sign-in and signed-in users off the entry
// pages — NOT the security boundary. "Signed in" is only the presence of Stytch's session
// cookie; real data protection is enforced by the backend's JWT validation, so plain path
// matching here is sufficient.

const SESSION_COOKIE = "stytch_session";

const isEntry = (path: string): boolean =>
  path === "/" ||
  path === "/sign-in" ||
  path.startsWith("/sign-in/") ||
  path === "/sign-up" ||
  path.startsWith("/sign-up/");

// The matcher below only exempts asset extensions, and .txt/.xml are not among them —
// without these a crawler fetching /robots.txt gets redirected to /sign-in.
const CRAWLER_PATHS = new Set([
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
  "/opengraph-image",
]);

const PUBLIC_PATHS = new Set<string>(PUBLIC_ROUTES.map((route) => route.path));

// Reachable signed in or out: /authenticate finishes sign-in and also the OAuth link flow
// for an existing session, and a password reset can start from either state.
const AUTH_FLOW_PATHS = new Set(["/authenticate", "/reset-password"]);

const isPublic = (path: string): boolean =>
  isEntry(path) ||
  AUTH_FLOW_PATHS.has(path) ||
  PUBLIC_PATHS.has(path) ||
  CRAWLER_PATHS.has(path);

export default function proxy(req: NextRequest) {
  const signedIn = req.cookies.has(SESSION_COOKIE);
  const { pathname, search, searchParams } = req.nextUrl;

  if (signedIn && isEntry(pathname)) {
    const next = safeReturnPath(searchParams.get("next")) ?? "/dashboard";
    return NextResponse.redirect(new URL(next, req.url));
  }

  if (!signedIn && !isPublic(pathname)) {
    const signIn = new URL("/sign-in", req.url);
    signIn.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(signIn);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|tsr|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
