"use client";

import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";

export default function SSOCallbackPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Finishing Google sign-in…</p>
      <AuthenticateWithRedirectCallback
        signInFallbackRedirectUrl="/call"
        signUpFallbackRedirectUrl="/call"
      />
    </div>
  );
}
