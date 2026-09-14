/**
 * Routes reachable without being signed in.
 *
 * Single source of truth on purpose. This list previously existed twice — once in proxy.ts as
 * Clerk route-matcher patterns, once in components/app-chrome.tsx as startsWith checks — and
 * the two drifted: /accept-invite was added to the middleware but not the chrome, so an
 * invitee got past auth and then rendered nothing, because the chrome only renders
 * <AuthLoading> or <Authenticated> and a signed-out visitor is neither.
 */
export const PUBLIC_ROUTE_PREFIXES = [
  "/sign-in",
  "/sign-up",
  "/sso-callback",
  "/accept-invite",
] as const;

/** Matcher patterns for Clerk's createRouteMatcher, plus the bare landing page. */
export const PUBLIC_ROUTE_PATTERNS = [
  "/",
  "/landing(.*)",
  ...PUBLIC_ROUTE_PREFIXES.map((prefix) => `${prefix}(.*)`),
];

export function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
