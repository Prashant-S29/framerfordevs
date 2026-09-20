// Renders the dashboard-hosted consent decision required by the public API OAuth flow.

import { Button } from "@framerfordevs/ui/components/button";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { authClient } from "@/lib/auth/client";

export const Route = createFileRoute("/oauth/consent")({
  ssr: false,
  component: OAuthConsentPage,
});

function OAuthConsentPage() {
  const session = authClient.useSession();
  const [pending, setPending] = useState<"approve" | "deny" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function decide(accept: boolean) {
    setPending(accept ? "approve" : "deny");
    setMessage(null);
    const result = await authClient.oauth2.consent({ accept });
    if (result.error) {
      setPending(null);
      setMessage("The authorization decision could not be completed. Restart the CLI login flow.");
      return;
    }
    if (result.data?.url) window.location.assign(result.data.url);
  }

  if (session.isPending) {
    return <main className="mx-auto max-w-xl px-6 py-16">Checking your session…</main>;
  }

  if (!session.data?.user) {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    return (
      <main className="mx-auto flex min-h-svh max-w-xl items-center px-6 py-16">
        <section className="space-y-4">
          <h1 className="text-2xl font-semibold">Sign in to authorize the CLI</h1>
          <p className="text-muted-foreground">
            Authentication is required before an authorization decision can be made.
          </p>
          <a
            className="underline underline-offset-4"
            href={`/login?returnTo=${encodeURIComponent(returnTo)}`}
          >
            Continue to sign in
          </a>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-xl items-center px-6 py-16">
      <section
        aria-labelledby="oauth-consent-heading"
        className="w-full space-y-6 rounded-xl border p-6"
      >
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm font-medium">CLI authorization</p>
          <h1 id="oauth-consent-heading" className="text-2xl font-semibold">
            Allow Framer for Devs CLI access?
          </h1>
          <p className="text-muted-foreground text-sm">
            Approve only if you started this login from your own CLI. The exact requested access is
            validated by the authorization server.
          </p>
        </div>
        {message ? (
          <p role="alert" className="text-destructive text-sm">
            {message}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button disabled={pending !== null} onClick={() => void decide(true)}>
            {pending === "approve" ? "Authorizing…" : "Authorize CLI"}
          </Button>
          <Button variant="outline" disabled={pending !== null} onClick={() => void decide(false)}>
            {pending === "deny" ? "Denying…" : "Deny"}
          </Button>
        </div>
      </section>
    </main>
  );
}
