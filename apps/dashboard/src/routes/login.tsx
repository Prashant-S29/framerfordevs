// Owns dashboard credentials and resumes only server-signed OAuth or validated UI destinations.

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import SignInForm from "@/components/auth/sign/in-form";
import { authClient } from "@/lib/auth/client";
import SignUpForm from "@/components/auth/sign/up-form";
import { getUser } from "@/functions/get-user";
import { getAuthenticatedRedirect, getSafeAuthenticatedReturnTo } from "@/lib/auth/navigation";
import {
  buildInvitationAcceptancePath,
  parseInvitationTokenHash,
} from "@/lib/auth/invitation-link";

function hasSignedOAuthContinuation(search: Record<string, unknown>): boolean {
  return (
    typeof search.sig === "string" &&
    search.sig.length > 0 &&
    search.sig.length <= 2_048 &&
    (typeof search.ba_param === "string" ||
      (Array.isArray(search.ba_param) && search.ba_param.length <= 64))
  );
}

export const Route = createFileRoute("/login")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    oauth: hasSignedOAuthContinuation(search) ? true : undefined,
    returnTo: getSafeAuthenticatedReturnTo(search.returnTo) ?? undefined,
  }),
  beforeLoad: async ({ search }) => {
    const session = await getUser();

    const authenticatedRedirect = search.oauth
      ? null
      : getAuthenticatedRedirect(session, search.returnTo);

    if (authenticatedRedirect) {
      throw authenticatedRedirect;
    }
  },
  component: RouteComponent,
});

function RouteComponent() {
  const [showSignIn, setShowSignIn] = useState(false);
  const { oauth, returnTo } = Route.useSearch();
  const session = authClient.useSession();
  const [oauthError, setOAuthError] = useState<string | null>(null);
  const oauthErrorRef = useRef<HTMLParagraphElement>(null);

  async function continueOAuth() {
    const result = await authClient.oauth2.continue({ postLogin: true });
    if (result.error || !result.data?.url) {
      setOAuthError(
        "The authorization request is invalid or expired. Restart authorization from the application that sent you here.",
      );
      return;
    }
    window.location.assign(result.data.url);
  }

  useEffect(() => {
    if (oauth && session.data?.user) void continueOAuth();
  }, [oauth, session.data?.user]);

  useEffect(() => {
    if (oauthError) oauthErrorRef.current?.focus();
  }, [oauthError]);

  function handleAuthenticated() {
    if (oauth) {
      void continueOAuth();
      return;
    }
    const token = parseInvitationTokenHash(window.location.hash);
    if (token) {
      window.location.assign(buildInvitationAcceptancePath(token));
      return;
    }
    window.location.assign(returnTo ?? "/dashboard");
  }

  if (oauthError) {
    return (
      <main className="mx-auto flex min-h-svh max-w-xl items-center px-6 py-16">
        <section className="space-y-4">
          <p ref={oauthErrorRef} role="alert" tabIndex={-1} className="text-destructive">
            {oauthError}
          </p>
          <a className="underline underline-offset-4" href="/dashboard">
            Return to the dashboard
          </a>
        </section>
      </main>
    );
  }

  if (oauth && session.data?.user) {
    return <main className="mx-auto max-w-xl px-6 py-16">Continuing authorization…</main>;
  }

  return showSignIn ? (
    <SignInForm
      onSwitchToSignUp={() => setShowSignIn(false)}
      onAuthenticated={handleAuthenticated}
    />
  ) : (
    <SignUpForm
      onSwitchToSignIn={() => setShowSignIn(true)}
      onAuthenticated={handleAuthenticated}
    />
  );
}
