"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import { Authenticated, AuthLoading } from "convex/react";
import { Loader2 } from "lucide-react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { PageTransition } from "@/components/page-transition";

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPublicRoute =
    pathname === "/" ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/sso-callback");

  if (isPublicRoute) {
    return <>{children}</>;
  }

  return (
    <>
      <AuthLoading>
        <div className="flex min-h-dvh items-center justify-center bg-background">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </AuthLoading>
      <Authenticated>
        <SignedInShell>{children}</SignedInShell>
      </Authenticated>
    </>
  );
}

function SignedInShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hasDashboardHeader =
    pathname === "/call" ||
    pathname === "/leads" ||
    pathname === "/docs" ||
    pathname === "/property";
  const { isLoaded, isSignedIn } = useUser();
  const { redirectToSignIn } = useClerk();

  if (!isLoaded) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isSignedIn) {
    void redirectToSignIn();
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <AppSidebar />
      <main className="relative min-h-dvh overflow-x-hidden bg-background px-4 py-6 pb-24 sm:px-6 sm:py-8 lg:px-8 lg:py-10 lg:pb-10 lg:pl-64">
        {hasDashboardHeader ? (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse 58% 42% at 100% 0%, var(--header-wash-end) 0%, #d7e6ff 28%, #eef4ff 52%, transparent 72%)",
              }}
            />
            <svg
              viewBox="0 0 400 200"
              preserveAspectRatio="none"
              aria-hidden="true"
              className="pointer-events-none absolute top-0 right-0 hidden h-[120px] w-[40vw] max-w-[400px] sm:block"
            >
              <path
                d="M0 100 C25 67 75 67 100 100 S175 133 200 100 S275 67 300 100 S375 133 400 100"
                fill="none"
                stroke="var(--palette-blue-500)"
                strokeWidth="2"
                strokeOpacity="0.28"
              />
            </svg>
          </>
        ) : null}
        <div className="relative mx-auto max-w-6xl lg:pl-10 lg:pr-6">
          <PageTransition>{children}</PageTransition>
        </div>
      </main>
    </>
  );
}
