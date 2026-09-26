// Renders the dashboard-hosted consent decision required by the public API OAuth flow.

import { Button } from "@framerfordevs/ui/components/button";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { authClient } from "@/lib/auth/client";

export const Route = createFileRoute("/oauth/consent")({
  ssr: false,
  component: OAuthConsentPage,
});

interface ConsentClientProjection {
  readonly clientId: string;
  readonly name: string;
  readonly uri: string | null;
  readonly studio: boolean;
}

export function OAuthConsentPage() {
  const session = authClient.useSession();
  const [pending, setPending] = useState<"approve" | "deny" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [client, setClient] = useState<ConsentClientProjection | null>(null);
  const [clientPending, setClientPending] = useState(true);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let active = true;
    const clientId = new URLSearchParams(window.location.search).get("client_id");
    if (!clientId) {
      setClientPending(false);
      setMessage("This authorization request is invalid. Restart the login flow.");
      return () => {
        active = false;
      };
    }
    void authClient.oauth2
      .publicClientPrelogin({ client_id: clientId })
      .then((result) => {
        if (!active) return;
        if (result.error || !result.data?.client_id || !result.data.client_name) {
          setMessage("This authorization request is invalid or expired. Restart the login flow.");
          return;
        }
        setClient({
          clientId: result.data.client_id,
          name: result.data.client_name,
          uri: result.data.client_uri ?? null,
          studio: result.data.client_id.startsWith("ffd-studio-v1-"),
        });
      })
      .catch(() => {
        if (active) {
          setMessage("This authorization request is invalid or expired. Restart the login flow.");
        }
      })
      .finally(() => {
        if (active) setClientPending(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (session.isPending || clientPending || !session.data?.user) return;
    if (message) messageRef.current?.focus();
    else headingRef.current?.focus();
  }, [clientPending, message, session.data?.user, session.isPending]);

  async function decide(accept: boolean) {
    setPending(accept ? "approve" : "deny");
    setMessage(null);
    const result = await authClient.oauth2.consent({ accept });
    if (result.error) {
      setPending(null);
      setMessage("The authorization decision could not be completed. Restart the login flow.");
      return;
    }
    if (result.data?.url) window.location.assign(result.data.url);
  }

  if (session.isPending || clientPending) {
    return <main className="mx-auto max-w-xl px-6 py-16">Checking your request…</main>;
  }

  if (!session.data?.user) {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    return (
      <main className="mx-auto flex min-h-svh max-w-xl items-center px-6 py-16">
        <section className="space-y-4">
          <h1 className="text-2xl font-semibold">Sign in to review authorization</h1>
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
          <p className="text-muted-foreground text-sm font-medium">
            {client?.studio ? "Studio authorization" : "CLI authorization"}
          </p>
          <h1
            ref={headingRef}
            id="oauth-consent-heading"
            tabIndex={-1}
            className="text-2xl font-semibold"
          >
            {client?.studio ? `Allow Studio access to ${client.name}?` : "Allow CLI access?"}
          </h1>
          {client?.studio ? (
            <div className="text-muted-foreground space-y-2 text-sm">
              <p>
                This allows the developer-operated application at the exact origin below to act with
                your current permissions for this project.
              </p>
              <p className="font-mono break-all text-foreground">{client.uri}</p>
              <p>You will be asked again for every new local Studio session.</p>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Approve only if you started this login from your own CLI. The exact requested access
              is validated by the authorization server.
            </p>
          )}
        </div>
        {message ? (
          <div className="space-y-2">
            <p ref={messageRef} role="alert" tabIndex={-1} className="text-destructive text-sm">
              {message}
            </p>
            <a className="text-sm underline underline-offset-4" href="/dashboard">
              Return to the dashboard
            </a>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button disabled={pending !== null || client === null} onClick={() => void decide(true)}>
            {pending === "approve" ? "Allowing…" : "Allow"}
          </Button>
          <Button variant="outline" disabled={pending !== null} onClick={() => void decide(false)}>
            {pending === "deny" ? "Denying…" : "Deny"}
          </Button>
        </div>
      </section>
    </main>
  );
}
