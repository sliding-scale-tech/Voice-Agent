import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

type AfterAuthArgs = {
  session?: { currentTask?: { key: string } | null } | null;
  decorateUrl: (path: string) => string;
};

export async function goAfterAuth(router: AppRouterInstance, { session, decorateUrl }: AfterAuthArgs) {
  const destination = session?.currentTask ? `/sign-in/tasks/${session.currentTask.key}` : "/call";
  const url = decorateUrl(destination);
  if (url.startsWith("http")) {
    window.location.href = url;
    return;
  }
  router.push(url);
  router.refresh();
}
