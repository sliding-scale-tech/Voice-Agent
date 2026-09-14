import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

type AfterAuthArgs = {
  session?: { currentTask?: { key: string } | null } | null;
  decorateUrl: (path: string) => string;
};

/**
 * Where to send someone after they sign in or up.
 *
 * Reads `redirect_url` from the current URL so a flow that interrupted itself can resume —
 * an invitation is the case that matters: the invitee arrives at /accept-invite holding a
 * token, is bounced through sign-up, and has to come back to that exact URL or the invite is
 * never redeemed. Hardcoding /call silently dropped them on an empty dashboard instead.
 *
 * Only same-origin absolute paths are honoured. "//evil.com" is a protocol-relative URL that
 * browsers treat as external, so it is rejected alongside anything carrying a scheme —
 * otherwise this is an open redirect anyone can point at a phishing page.
 */
export function afterAuthDestination(fallback = "/call"): string {
  if (typeof window === "undefined") return fallback;
  const requested = new URLSearchParams(window.location.search).get("redirect_url");
  if (!requested) return fallback;
  if (!requested.startsWith("/") || requested.startsWith("//")) return fallback;
  return requested;
}

export async function goAfterAuth(router: AppRouterInstance, { session, decorateUrl }: AfterAuthArgs) {
  const destination = session?.currentTask
    ? `/sign-in/tasks/${session.currentTask.key}`
    : afterAuthDestination();
  const url = decorateUrl(destination);
  if (url.startsWith("http")) {
    window.location.href = url;
    return;
  }
  router.push(url);
  router.refresh();
}
