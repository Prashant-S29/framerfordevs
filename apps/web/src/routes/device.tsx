import { Button, buttonVariants } from "@framerfordevs/ui/components/button";
import { Input } from "@framerfordevs/ui/components/input";
import { Label } from "@framerfordevs/ui/components/label";
import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";

interface DeviceRequestSummary {
  readonly userCode: string;
  readonly clientId: string;
  readonly scopes: ReadonlyArray<string>;
  readonly resources: ReadonlyArray<string>;
}

function normalizeUserCode(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replaceAll("-", "").toUpperCase();
  return /^[A-Z0-9]{6,32}$/u.test(normalized) ? normalized : undefined;
}

export const Route = createFileRoute("/device")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    user_code: normalizeUserCode(search.user_code),
  }),
  component: DeviceAuthorizationPage,
});

function DeviceAuthorizationPage() {
  const search = Route.useSearch();
  const session = authClient.useSession();
  const [enteredCode, setEnteredCode] = useState(search.user_code ?? "");
  const [request, setRequest] = useState<DeviceRequestSummary | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "approving" | "denying" | "done">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const userCode = search.user_code;
    if (userCode === undefined || !session.data?.user) return;

    let active = true;
    setStatus("loading");
    setMessage(null);
    void authClient
      .device({ query: { user_code: userCode } })
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data || data.status !== "pending" || data.client_id === undefined) {
          setRequest(null);
          setStatus("idle");
          setMessage("This authorization code is invalid, expired, or already processed.");
          return;
        }

        const resources =
          typeof data.resource === "string"
            ? [data.resource]
            : Array.isArray(data.resource)
              ? data.resource
              : [];
        setRequest({
          userCode,
          clientId: data.client_id,
          scopes: data.scope?.split(" ").filter((scope) => scope.length > 0) ?? [],
          resources,
        });
        setStatus("idle");
      })
      .catch(() => {
        if (!active) return;
        setRequest(null);
        setStatus("idle");
        setMessage("The authorization request could not be verified. Try again.");
      });

    return () => {
      active = false;
    };
  }, [search.user_code, session.data?.user]);

  function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const userCode = normalizeUserCode(enteredCode);
    if (userCode === undefined) {
      setMessage("Enter the code shown by the CLI.");
      return;
    }
    window.location.assign(`/device?user_code=${encodeURIComponent(userCode)}`);
  }

  async function decide(action: "approve" | "deny") {
    if (request === null) return;
    setStatus(action === "approve" ? "approving" : "denying");
    setMessage(null);

    const result =
      action === "approve"
        ? await authClient.device.approve({ userCode: request.userCode })
        : await authClient.device.deny({ userCode: request.userCode });

    if (result.error) {
      setStatus("idle");
      setMessage("The request could not be processed. It may have expired; verify the code again.");
      return;
    }

    setRequest(null);
    setStatus("done");
    setMessage(
      action === "approve"
        ? "Device approved. Return to the CLI to continue."
        : "Device authorization denied.",
    );
  }

  const returnTo =
    search.user_code === undefined
      ? "/device"
      : `/device?user_code=${encodeURIComponent(search.user_code)}`;
  const loginHref = `/login?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-2xl items-center px-6 py-12">
      <section
        className="bg-card w-full space-y-6 rounded-xl border p-6 shadow-sm"
        aria-live="polite"
      >
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm font-medium">CLI authorization</p>
          <h1 className="text-2xl font-semibold">Authorize a device</h1>
          <p className="text-muted-foreground text-sm">
            Only approve a request you started yourself. Confirm that this code exactly matches the
            code displayed by your CLI; never approve a code sent in a message.
          </p>
        </div>

        {request === null && status !== "done" ? (
          <form className="space-y-4" onSubmit={submitCode}>
            <div className="space-y-2">
              <Label htmlFor="device-user-code">Device code</Label>
              <Input
                id="device-user-code"
                value={enteredCode}
                onChange={(event) => setEnteredCode(event.target.value)}
                autoComplete="one-time-code"
                inputMode="text"
                maxLength={40}
                placeholder="ABCD1234"
                aria-describedby="device-code-help"
              />
              <p id="device-code-help" className="text-muted-foreground text-xs">
                Dashes and letter case do not matter.
              </p>
            </div>
            {session.isPending ? (
              <p className="text-muted-foreground text-sm">Checking your session…</p>
            ) : session.data?.user ? (
              <Button type="submit" disabled={status === "loading"}>
                {status === "loading" ? "Verifying…" : "Verify code"}
              </Button>
            ) : (
              <a href={loginHref} className={buttonVariants()}>
                Sign in to continue
              </a>
            )}
          </form>
        ) : null}

        {request !== null ? (
          <div className="space-y-5">
            <dl className="grid gap-3 rounded-lg border p-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Matching code</dt>
                <dd className="font-mono text-lg font-semibold tracking-widest">
                  {request.userCode}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Application</dt>
                <dd className="font-medium">
                  {request.clientId === "framerfordevs-cli"
                    ? "Framer for Developers CLI"
                    : request.clientId}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Requested access</dt>
                <dd>{request.scopes.join(", ") || "No scopes supplied"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Resource</dt>
                <dd className="break-all">{request.resources.join(", ") || "Not supplied"}</dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => void decide("approve")} disabled={status !== "idle"}>
                {status === "approving" ? "Approving…" : "Approve this device"}
              </Button>
              <Button
                variant="outline"
                onClick={() => void decide("deny")}
                disabled={status !== "idle"}
              >
                {status === "denying" ? "Denying…" : "Deny"}
              </Button>
            </div>
          </div>
        ) : null}

        {message ? (
          <p role={status === "done" ? "status" : "alert"} className="text-sm">
            {message}
          </p>
        ) : null}
      </section>
    </main>
  );
}
