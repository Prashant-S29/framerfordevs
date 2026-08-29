import { buttonVariants, Button } from "@framerfordevs/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@framerfordevs/ui/components/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@framerfordevs/ui/components/empty";
import { Spinner } from "@framerfordevs/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MailWarningIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth/client";
import { buildInvitationSignInLink, parseInvitationTokenHash } from "@/lib/auth/invitation-link";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/invitations/accept")({
  ssr: false,
  component: InvitationAcceptance,
});

function InvitationAcceptance() {
  const navigate = useNavigate();
  const session = authClient.useSession();
  const [token, setToken] = useState<string | null>(null);
  const [hasInvalidFragment, setHasInvalidFragment] = useState(false);
  const [hasReadFragment, setHasReadFragment] = useState(false);
  const inspect = useMutation(
    orpc.platform.projects.invitations.inspect.mutationOptions({
      onError: () => undefined,
    }),
  );
  const accept = useMutation(
    orpc.platform.projects.invitations.accept.mutationOptions({
      onSuccess: (response) => {
        setToken(null);
        inspect.reset();
        accept.reset();
        toast.success(response.message);
        navigate({ to: "/projects/$projectId", params: { projectId: response.data.projectId } });
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  useEffect(() => {
    if (session.isPending || hasReadFragment) return;
    const invitationToken = parseInvitationTokenHash(window.location.hash);
    setToken(invitationToken);
    setHasInvalidFragment(invitationToken === null);
    setHasReadFragment(true);
    if (invitationToken && session.data) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [hasReadFragment, session.data, session.isPending]);

  if (session.isPending || !hasReadFragment) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-lg items-center justify-center px-4 py-10">
        <div className="flex items-center gap-2" aria-label="Loading invitation">
          <Spinner />
          <span className="text-muted-foreground text-sm">Loading invitation…</span>
        </div>
      </main>
    );
  }

  if (!token || hasInvalidFragment) return <InvalidInvitation />;

  if (!session.data) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-lg items-center px-4 py-10">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Sign in to review this invitation</CardTitle>
            <CardDescription>
              Use the invited email address. The invitation token stays in the URL fragment and is
              never sent as a query parameter.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <a className={buttonVariants()} href={buildInvitationSignInLink(token)}>
              Continue to sign in
            </a>
          </CardFooter>
        </Card>
      </main>
    );
  }

  const invitation = inspect.data?.data;

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg items-center px-4 py-10">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>
            {invitation ? `Join ${invitation.projectName}` : "Review invitation"}
          </CardTitle>
          <CardDescription>
            {invitation
              ? `${invitation.inviterName} invited you with the ${invitation.role.replaceAll("_", " ")} role.`
              : "Validate the invitation before joining the project."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {inspect.isError ? (
            <p role="alert" className="text-destructive text-sm">
              This invitation is invalid or no longer available.
            </p>
          ) : invitation ? (
            <p className="text-muted-foreground text-sm">
              Access is project-scoped and can be revoked by a project owner at any time.
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          {!invitation ? (
            <Button disabled={inspect.isPending} onClick={() => inspect.mutate({ token })}>
              {inspect.isPending ? <Spinner data-icon="inline-start" /> : null}
              Review invitation
            </Button>
          ) : (
            <Button disabled={accept.isPending} onClick={() => accept.mutate({ token })}>
              {accept.isPending ? <Spinner data-icon="inline-start" /> : null}
              Accept invitation
            </Button>
          )}
          <a className={buttonVariants({ variant: "outline" })} href="/dashboard">
            Cancel
          </a>
        </CardFooter>
      </Card>
    </main>
  );
}

function InvalidInvitation() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg items-center px-4 py-10">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MailWarningIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>Invitation unavailable</EmptyTitle>
          <EmptyDescription>
            The link is malformed, expired, revoked, already accepted, or belongs to another email.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <a className={buttonVariants({ variant: "outline" })} href="/dashboard">
            Return to dashboard
          </a>
        </EmptyContent>
      </Empty>
    </main>
  );
}
