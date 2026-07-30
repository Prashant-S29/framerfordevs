import type {
  ApiCredential,
  CredentialFamily,
  CredentialScope,
  ProjectInvitation,
  ProjectMember,
  ProjectPermissionAction,
  ProjectRole,
} from "@framerfordevs/api/contracts/access";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@framerfordevs/ui/components/alert-dialog";
import { Badge } from "@framerfordevs/ui/components/badge";
import { Button } from "@framerfordevs/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@framerfordevs/ui/components/card";
import { Checkbox } from "@framerfordevs/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@framerfordevs/ui/components/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@framerfordevs/ui/components/empty";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@framerfordevs/ui/components/field";
import { Input } from "@framerfordevs/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@framerfordevs/ui/components/native-select";
import { Spinner } from "@framerfordevs/ui/components/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@framerfordevs/ui/components/tabs";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CopyIcon,
  KeyRoundIcon,
  RefreshCwIcon,
  ShieldIcon,
  Trash2Icon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { buildInvitationLink } from "@/lib/invitation-link";
import { orpc } from "@/utils/orpc";

const projectRoles: ReadonlyArray<ProjectRole> = [
  "owner",
  "developer",
  "content_admin",
  "editor",
  "reviewer",
  "client_editor",
  "read_only",
];

const roleLabels: Readonly<Record<ProjectRole, string>> = {
  owner: "Owner",
  developer: "Developer",
  content_admin: "Content administrator",
  editor: "Editor",
  reviewer: "Reviewer",
  client_editor: "Client editor",
  read_only: "Read only",
};

function parseProjectRole(value: string): ProjectRole | undefined {
  return projectRoles.find((role) => role === value);
}

function parseCredentialFamily(value: string): CredentialFamily | undefined {
  if (value === "management" || value === "delivery" || value === "preview") return value;
  return undefined;
}

const roleDescriptions: Readonly<Record<ProjectRole, string>> = {
  owner: "Full project governance, members, credentials, and archive access.",
  developer: "Project configuration, schemas, content, and credentials without member governance.",
  content_admin: "Content authoring, review, and publication without implementation settings.",
  editor: "Draft content authoring without review or publication authority.",
  reviewer: "Content review and publication without draft editing.",
  client_editor: "Constrained client-facing content editing.",
  read_only: "Read access to project, schema, locale, and content resources.",
};

const managementScopes: ReadonlyArray<CredentialScope> = [
  "project.read",
  "project.update",
  "project.capability.manage",
  "locale.read",
  "locale.manage",
  "schema.read",
  "schema.write",
  "schema.publish",
  "content.read",
  "content.write",
  "content.review",
  "content.publish",
  "webhook.read",
  "webhook.manage",
];

const dateFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

interface ProjectAccessSettingsProps {
  readonly projectId: string;
  readonly environmentId: string;
  readonly role: ProjectRole;
  readonly allowedActions: ReadonlyArray<ProjectPermissionAction>;
}

export function ProjectAccessSettings({
  projectId,
  environmentId,
  role,
  allowedActions,
}: ProjectAccessSettingsProps) {
  const actions = new Set(allowedActions);
  const canReadMembers = actions.has("project.member.read");
  const canInvite = actions.has("project.member.invite");
  const canMutateMembers =
    actions.has("project.member.role.update") && actions.has("project.member.remove");
  const canReadCredentials = actions.has("project.credential.read");
  const canIssueCredentials = actions.has("project.credential.issue");
  const canRotateCredentials = actions.has("project.credential.rotate");
  const canRevokeCredentials = actions.has("project.credential.revoke");

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Access and API credentials</CardTitle>
            <CardDescription>
              Server-enforced project collaboration and environment-bound integration access.
            </CardDescription>
          </div>
          <Badge variant="outline">{roleLabels[role]}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {canReadMembers || canReadCredentials ? (
          <Tabs defaultValue={canReadMembers ? "members" : "credentials"}>
            <TabsList variant="line" aria-label="Access settings">
              {canReadMembers ? <TabsTrigger value="members">Members</TabsTrigger> : null}
              {canReadCredentials ? (
                <TabsTrigger value="credentials">API credentials</TabsTrigger>
              ) : null}
            </TabsList>
            {canReadMembers ? (
              <TabsContent value="members" className="pt-4">
                <MembersPanel
                  projectId={projectId}
                  canInvite={canInvite}
                  canMutate={canMutateMembers}
                />
              </TabsContent>
            ) : null}
            {canReadCredentials ? (
              <TabsContent value="credentials" className="pt-4">
                <CredentialsPanel
                  projectId={projectId}
                  environmentId={environmentId}
                  canIssue={canIssueCredentials}
                  canRotate={canRotateCredentials}
                  canRevoke={canRevokeCredentials}
                />
              </TabsContent>
            ) : null}
          </Tabs>
        ) : (
          <div className="flex items-start gap-3">
            <ShieldIcon aria-hidden="true" />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Permission-aware access</p>
              <p className="text-muted-foreground text-sm">{roleDescriptions[role]}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MembersPanel({
  projectId,
  canInvite,
  canMutate,
}: {
  readonly projectId: string;
  readonly canInvite: boolean;
  readonly canMutate: boolean;
}) {
  const members = useInfiniteQuery(
    orpc.platform.projects.members.list.infiniteOptions({
      input: (cursor: string | null) => ({ projectId, cursor, limit: 20 }),
      initialPageParam: null,
      getNextPageParam: (lastPage) => lastPage.data.nextCursor ?? undefined,
      maxPages: 10,
    }),
  );
  const invitations = useInfiniteQuery(
    orpc.platform.projects.invitations.list.infiniteOptions({
      input: (cursor: string | null) => ({ projectId, cursor, limit: 20 }),
      initialPageParam: null,
      getNextPageParam: (lastPage) => lastPage.data.nextCursor ?? undefined,
      maxPages: 10,
    }),
  );
  const memberItems = members.data?.pages.flatMap((page) => page.data.items) ?? [];
  const invitationItems = invitations.data?.pages.flatMap((page) => page.data.items) ?? [];

  if (members.isPending || invitations.isPending) {
    return (
      <div className="flex items-center gap-2" aria-label="Loading project members">
        <Spinner />
        <span className="text-muted-foreground text-sm">Loading members…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-medium">Project members</h3>
          <p className="text-muted-foreground text-sm">
            Membership changes take effect immediately and preserve audit history.
          </p>
        </div>
        {canInvite ? <InviteMemberDialog projectId={projectId} /> : null}
      </div>

      {memberItems.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>No project members</EmptyTitle>
            <EmptyDescription>Invite a collaborator to establish project access.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
          {memberItems.map((member) => (
            <MemberRow key={member.id} member={member} canMutate={canMutate} />
          ))}
        </div>
      )}
      {members.hasNextPage ? (
        <Button
          variant="outline"
          className="self-center"
          disabled={members.isFetchingNextPage}
          onClick={() => void members.fetchNextPage()}
        >
          {members.isFetchingNextPage ? <Spinner data-icon="inline-start" /> : null}
          {members.isFetchingNextPage ? "Loading…" : "Load more members"}
        </Button>
      ) : null}

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">Invitations</h3>
        {invitationItems.length === 0 ? (
          <p className="text-muted-foreground text-sm">No invitations have been created.</p>
        ) : (
          invitationItems.map((invitation) => (
            <InvitationRow key={invitation.id} invitation={invitation} canRevoke={canInvite} />
          ))
        )}
        {invitations.hasNextPage ? (
          <Button
            variant="outline"
            className="self-center"
            disabled={invitations.isFetchingNextPage}
            onClick={() => void invitations.fetchNextPage()}
          >
            {invitations.isFetchingNextPage ? <Spinner data-icon="inline-start" /> : null}
            {invitations.isFetchingNextPage ? "Loading…" : "Load more invitations"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function MemberRow({
  member,
  canMutate,
}: {
  readonly member: ProjectMember;
  readonly canMutate: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{member.name}</p>
        <p className="text-muted-foreground truncate text-sm">{member.email}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{roleLabels[member.role]}</Badge>
        {canMutate ? <MemberActions member={member} /> : null}
      </div>
    </div>
  );
}

function MemberActions({ member }: { readonly member: ProjectMember }) {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<ProjectRole>(member.role);
  const updateRole = useMutation(
    orpc.platform.projects.members.updateRole.mutationOptions({
      onSuccess: async (response) => {
        await queryClient.invalidateQueries({ queryKey: orpc.platform.projects.members.key() });
        toast.success(response.message);
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const remove = useMutation(
    orpc.platform.projects.members.remove.mutationOptions({
      onSuccess: async (response) => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: orpc.platform.projects.members.key() }),
          queryClient.invalidateQueries({ queryKey: orpc.platform.projects.key() }),
        ]);
        toast.success(response.message);
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <NativeSelect
        aria-label={`Role for ${member.name}`}
        value={role}
        onChange={(event) => {
          const nextRole = parseProjectRole(event.target.value);
          if (nextRole) setRole(nextRole);
        }}
      >
        {projectRoles.map((value) => (
          <NativeSelectOption key={value} value={value}>
            {roleLabels[value]}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <Button
        size="sm"
        variant="outline"
        disabled={role === member.role || updateRole.isPending}
        onClick={() =>
          updateRole.mutate({ membershipId: member.id, version: member.version, role })
        }
      >
        {updateRole.isPending ? <Spinner data-icon="inline-start" /> : null}
        Save role
      </Button>
      <AlertDialog>
        <AlertDialogTrigger render={<Button size="sm" variant="destructive" />}>
          <Trash2Icon data-icon="inline-start" />
          Remove
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {member.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Project access stops immediately. Audit and membership history remain available.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => remove.mutate({ membershipId: member.id, version: member.version })}
            >
              {remove.isPending ? <Spinner data-icon="inline-start" /> : null}
              Remove member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function InvitationRow({
  invitation,
  canRevoke,
}: {
  readonly invitation: ProjectInvitation;
  readonly canRevoke: boolean;
}) {
  const queryClient = useQueryClient();
  const revoke = useMutation(
    orpc.platform.projects.invitations.revoke.mutationOptions({
      onSuccess: async (response) => {
        await queryClient.invalidateQueries({ queryKey: orpc.platform.projects.invitations.key() });
        toast.success(response.message);
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  return (
    <div className="flex flex-col gap-3 border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{invitation.email}</p>
        <p className="text-muted-foreground text-sm">
          {roleLabels[invitation.role]} · Expires{" "}
          {dateFormatter.format(new Date(invitation.expiresAt))}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={invitation.status === "pending" ? "outline" : "secondary"}>
          {invitation.status}
        </Badge>
        {canRevoke && invitation.status === "pending" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={revoke.isPending}
            onClick={() =>
              revoke.mutate({ invitationId: invitation.id, version: invitation.version })
            }
          >
            Revoke
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function InviteMemberDialog({ projectId }: { readonly projectId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ProjectRole>("client_editor");
  const [invitationLink, setInvitationLink] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const createInvitation = useMutation(
    orpc.platform.projects.invitations.create.mutationOptions({
      onSuccess: async (response) => {
        const link = buildInvitationLink(window.location.origin, response.data.token);
        setInvitationLink(link);
        await queryClient.invalidateQueries({ queryKey: orpc.platform.projects.invitations.key() });
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  function reset() {
    setEmail("");
    setRole("client_editor");
    setInvitationLink(null);
    setAcknowledged(false);
    createInvitation.reset();
  }

  function changeOpen(nextOpen: boolean) {
    if (!nextOpen && invitationLink && !acknowledged) return;
    setOpen(nextOpen);
    if (!nextOpen) reset();
  }

  async function copyLink() {
    if (!invitationLink) return;
    await navigator.clipboard.writeText(invitationLink);
    toast.success("Invitation link copied.");
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger render={<Button />}>
        <UserPlusIcon data-icon="inline-start" />
        Invite member
      </DialogTrigger>
      <DialogContent showCloseButton={!invitationLink} className="overscroll-contain sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {invitationLink ? "Copy invitation link" : "Invite a project member"}
          </DialogTitle>
          <DialogDescription>
            {invitationLink
              ? "This one-time link is not stored in recoverable form. Copy it before closing."
              : "Invitations expire after seven days and can only be accepted by the matching email."}
          </DialogDescription>
        </DialogHeader>
        {invitationLink ? (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="invitation-link">One-time invitation link</FieldLabel>
              <Input
                id="invitation-link"
                name="invitation-link"
                readOnly
                value={invitationLink}
                autoComplete="off"
                spellCheck={false}
                translate="no"
              />
              <FieldDescription>Share this link through a trusted channel.</FieldDescription>
            </Field>
            <Button type="button" variant="outline" onClick={() => void copyLink()}>
              <CopyIcon data-icon="inline-start" />
              Copy link
            </Button>
            <Field orientation="horizontal">
              <Checkbox
                id="invitation-saved"
                checked={acknowledged}
                onCheckedChange={setAcknowledged}
              />
              <FieldLabel htmlFor="invitation-saved">I saved the invitation link.</FieldLabel>
            </Field>
          </FieldGroup>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              createInvitation.mutate({ projectId, email, role });
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="invitation-email">Email</FieldLabel>
                <Input
                  id="invitation-email"
                  name="invitation-email"
                  type="email"
                  autoComplete="email"
                  spellCheck={false}
                  value={email}
                  required
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="invitation-role">Role</FieldLabel>
                <NativeSelect
                  id="invitation-role"
                  name="invitation-role"
                  className="w-full"
                  value={role}
                  onChange={(event) => {
                    const nextRole = parseProjectRole(event.target.value);
                    if (nextRole) setRole(nextRole);
                  }}
                >
                  {projectRoles.map((value) => (
                    <NativeSelectOption key={value} value={value}>
                      {roleLabels[value]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <FieldDescription>{roleDescriptions[role]}</FieldDescription>
              </Field>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => changeOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createInvitation.isPending || email.trim() === ""}>
                  {createInvitation.isPending ? <Spinner data-icon="inline-start" /> : null}
                  Create invitation
                </Button>
              </DialogFooter>
            </FieldGroup>
          </form>
        )}
        {invitationLink ? (
          <DialogFooter>
            <Button disabled={!acknowledged} onClick={() => changeOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CredentialsPanel({
  projectId,
  environmentId,
  canIssue,
  canRotate,
  canRevoke,
}: {
  readonly projectId: string;
  readonly environmentId: string;
  readonly canIssue: boolean;
  readonly canRotate: boolean;
  readonly canRevoke: boolean;
}) {
  const credentials = useInfiniteQuery(
    orpc.platform.projects.credentials.list.infiniteOptions({
      input: (cursor: string | null) => ({ projectId, environmentId, cursor, limit: 20 }),
      initialPageParam: null,
      getNextPageParam: (lastPage) => lastPage.data.nextCursor ?? undefined,
      maxPages: 10,
    }),
  );
  const items = credentials.data?.pages.flatMap((page) => page.data.items) ?? [];

  if (credentials.isPending) {
    return (
      <div className="flex items-center gap-2" aria-label="Loading API credentials">
        <Spinner />
        <span className="text-muted-foreground text-sm">Loading credentials…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-medium">Environment credentials</h3>
          <p className="text-muted-foreground text-sm">
            Management, delivery, and preview authority never overlap.
          </p>
        </div>
        {canIssue ? (
          <IssueCredentialDialog projectId={projectId} environmentId={environmentId} />
        ) : null}
      </div>
      {items.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <KeyRoundIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>No API credentials</EmptyTitle>
            <EmptyDescription>
              Issue an environment-bound credential when an integration needs access.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((credential) => (
            <CredentialRow
              key={credential.id}
              credential={credential}
              canRotate={canRotate}
              canRevoke={canRevoke}
            />
          ))}
        </div>
      )}
      {credentials.hasNextPage ? (
        <Button
          variant="outline"
          className="self-center"
          disabled={credentials.isFetchingNextPage}
          onClick={() => void credentials.fetchNextPage()}
        >
          {credentials.isFetchingNextPage ? <Spinner data-icon="inline-start" /> : null}
          {credentials.isFetchingNextPage ? "Loading…" : "Load more credentials"}
        </Button>
      ) : null}
    </div>
  );
}

function CredentialRow({
  credential,
  canRotate,
  canRevoke,
}: {
  readonly credential: ApiCredential;
  readonly canRotate: boolean;
  readonly canRevoke: boolean;
}) {
  const queryClient = useQueryClient();
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const rotate = useMutation(
    orpc.platform.projects.credentials.rotate.mutationOptions({
      onSuccess: async (response) => {
        setRevealedKey(response.data.key);
        await queryClient.invalidateQueries({ queryKey: orpc.platform.projects.credentials.key() });
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const revoke = useMutation(
    orpc.platform.projects.credentials.revoke.mutationOptions({
      onSuccess: async (response) => {
        await queryClient.invalidateQueries({ queryKey: orpc.platform.projects.credentials.key() });
        toast.success(response.message);
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  return (
    <div className="flex flex-col gap-3 border p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{credential.name}</p>
          <p className="text-muted-foreground truncate font-mono text-xs" translate="no">
            {credential.keyPrefix}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{credential.family}</Badge>
          <Badge variant={credential.revokedAt ? "secondary" : "default"}>
            {credential.revokedAt ? "Revoked" : "Active"}
          </Badge>
        </div>
      </div>
      <p className="text-muted-foreground break-words text-sm">
        Scopes: {credential.scopes.join(", ")}
      </p>
      <p className="text-muted-foreground text-sm">
        {credential.expiresAt
          ? `Expires ${dateFormatter.format(new Date(credential.expiresAt))}`
          : "Does not expire"}
      </p>
      {!credential.revokedAt && (canRotate || canRevoke) ? (
        <div className="flex flex-wrap gap-2">
          {canRotate ? (
            <AlertDialog>
              <AlertDialogTrigger render={<Button size="sm" variant="outline" />}>
                <RefreshCwIcon data-icon="inline-start" />
                Rotate
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Rotate {credential.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The current key stops working immediately. The replacement is shown once.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={rotate.isPending}
                    onClick={() =>
                      rotate.mutate({ credentialId: credential.id, version: credential.version })
                    }
                  >
                    {rotate.isPending ? <Spinner data-icon="inline-start" /> : null}
                    Rotate credential
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
          {canRevoke ? (
            <AlertDialog>
              <AlertDialogTrigger render={<Button size="sm" variant="destructive" />}>
                Revoke
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Revoke {credential.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Revocation is immediate and cannot be undone. Issue a new key if access is
                    needed later.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    disabled={revoke.isPending}
                    onClick={() =>
                      revoke.mutate({ credentialId: credential.id, version: credential.version })
                    }
                  >
                    {revoke.isPending ? <Spinner data-icon="inline-start" /> : null}
                    Revoke credential
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>
      ) : null}
      <OneTimeKeyDialog
        open={revealedKey !== null}
        credentialKey={revealedKey}
        acknowledged={acknowledged}
        setAcknowledged={setAcknowledged}
        onClose={() => {
          setRevealedKey(null);
          setAcknowledged(false);
          rotate.reset();
        }}
        title="Copy rotated credential"
      />
    </div>
  );
}

function defaultExpiryLocal(): string {
  const date = new Date(Date.now() + 90 * 24 * 60 * 60 * 1_000);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function futureExpiryIso(value: string): string | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) || date.getTime() <= Date.now() ? null : date.toISOString();
}

export function IssueCredentialDialog({
  projectId,
  environmentId,
}: {
  readonly projectId: string;
  readonly environmentId: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [family, setFamily] = useState<CredentialFamily>("delivery");
  const [scopes, setScopes] = useState<ReadonlyArray<CredentialScope>>(["delivery.read"]);
  const [expiry, setExpiry] = useState(defaultExpiryLocal);
  const [nonExpiring, setNonExpiring] = useState(false);
  const [nonExpiringAcknowledged, setNonExpiringAcknowledged] = useState(false);
  const [issuedKey, setIssuedKey] = useState<string | null>(null);
  const [keyAcknowledged, setKeyAcknowledged] = useState(false);
  const issue = useMutation(
    orpc.platform.projects.credentials.issue.mutationOptions({
      onSuccess: async (response) => {
        setIssuedKey(response.data.key);
        await queryClient.invalidateQueries({ queryKey: orpc.platform.projects.credentials.key() });
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  function selectFamily(nextFamily: CredentialFamily) {
    setFamily(nextFamily);
    setScopes(
      nextFamily === "delivery"
        ? ["delivery.read"]
        : nextFamily === "preview"
          ? ["preview.read"]
          : ["project.read"],
    );
  }

  function reset() {
    setName("");
    setFamily("delivery");
    setScopes(["delivery.read"]);
    setExpiry(defaultExpiryLocal());
    setNonExpiring(false);
    setNonExpiringAcknowledged(false);
    setIssuedKey(null);
    setKeyAcknowledged(false);
    issue.reset();
  }

  function changeOpen(nextOpen: boolean) {
    if (!nextOpen && issuedKey && !keyAcknowledged) return;
    setOpen(nextOpen);
    if (!nextOpen) reset();
  }

  function toggleScope(scope: CredentialScope, checked: boolean) {
    setScopes((current) =>
      checked ? [...current, scope] : current.filter((value) => value !== scope),
    );
  }

  const expiresAt = nonExpiring ? null : futureExpiryIso(expiry);
  const canSubmit =
    name.trim() !== "" &&
    scopes.length > 0 &&
    (!nonExpiring || nonExpiringAcknowledged) &&
    (nonExpiring || expiresAt !== null);

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger render={<Button />}>
        <KeyRoundIcon data-icon="inline-start" />
        Issue credential
      </DialogTrigger>
      <DialogContent
        showCloseButton={!issuedKey}
        className="max-h-[90vh] overflow-y-auto overscroll-contain sm:max-w-xl"
      >
        <DialogHeader>
          <DialogTitle>{issuedKey ? "Copy API credential" : "Issue API credential"}</DialogTitle>
          <DialogDescription>
            {issuedKey
              ? "The raw key is shown once and is not recoverable after closing."
              : "Choose the narrowest family, scopes, and lifetime required by the integration."}
          </DialogDescription>
        </DialogHeader>
        {issuedKey ? (
          <OneTimeKeyContent
            credentialKey={issuedKey}
            acknowledged={keyAcknowledged}
            setAcknowledged={setKeyAcknowledged}
          />
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!canSubmit) return;
              issue.mutate({
                projectId,
                environmentId,
                family,
                name,
                scopes,
                expiresAt,
              });
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="credential-name">Name</FieldLabel>
                <Input
                  id="credential-name"
                  name="credential-name"
                  autoComplete="off"
                  value={name}
                  required
                  maxLength={100}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="credential-family">Family</FieldLabel>
                <NativeSelect
                  id="credential-family"
                  name="credential-family"
                  className="w-full"
                  value={family}
                  onChange={(event) => {
                    const nextFamily = parseCredentialFamily(event.target.value);
                    if (nextFamily) selectFamily(nextFamily);
                  }}
                >
                  <NativeSelectOption value="management">Management</NativeSelectOption>
                  <NativeSelectOption value="delivery">Delivery</NativeSelectOption>
                  <NativeSelectOption value="preview">Preview</NativeSelectOption>
                </NativeSelect>
                <FieldDescription>
                  {family === "management"
                    ? "Authoring and integration operations only."
                    : family === "delivery"
                      ? "Published delivery reads only."
                      : "Authenticated draft and revision preview reads only."}
                </FieldDescription>
              </Field>
              {family === "management" ? (
                <FieldSet>
                  <FieldLegend>Management scopes</FieldLegend>
                  <div data-slot="checkbox-group" className="grid gap-3 sm:grid-cols-2">
                    {managementScopes.map((scope) => (
                      <Field key={scope} orientation="horizontal">
                        <Checkbox
                          id={`scope-${scope}`}
                          checked={scopes.includes(scope)}
                          onCheckedChange={(checked) => toggleScope(scope, checked)}
                        />
                        <FieldLabel htmlFor={`scope-${scope}`}>{scope}</FieldLabel>
                      </Field>
                    ))}
                  </div>
                  {scopes.length === 0 ? <FieldError>Select at least one scope.</FieldError> : null}
                </FieldSet>
              ) : null}
              <Field data-disabled={nonExpiring}>
                <FieldLabel htmlFor="credential-expiry">Expiry</FieldLabel>
                <Input
                  id="credential-expiry"
                  name="credential-expiry"
                  type="datetime-local"
                  value={expiry}
                  disabled={nonExpiring}
                  required={!nonExpiring}
                  onChange={(event) => setExpiry(event.target.value)}
                />
                <FieldDescription>Defaults to 90 days.</FieldDescription>
                {!nonExpiring && expiresAt === null ? (
                  <FieldError>Choose a future expiry date and time.</FieldError>
                ) : null}
              </Field>
              <Field orientation="horizontal">
                <Checkbox
                  id="credential-non-expiring"
                  checked={nonExpiring}
                  onCheckedChange={(checked) => {
                    setNonExpiring(checked);
                    if (!checked) setNonExpiringAcknowledged(false);
                  }}
                />
                <FieldLabel htmlFor="credential-non-expiring">Create without an expiry</FieldLabel>
              </Field>
              {nonExpiring ? (
                <Field orientation="horizontal">
                  <Checkbox
                    id="credential-non-expiring-ack"
                    checked={nonExpiringAcknowledged}
                    onCheckedChange={setNonExpiringAcknowledged}
                  />
                  <FieldLabel htmlFor="credential-non-expiring-ack">
                    I understand non-expiring credentials require manual rotation and revocation.
                  </FieldLabel>
                </Field>
              ) : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => changeOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!canSubmit || issue.isPending}>
                  {issue.isPending ? <Spinner data-icon="inline-start" /> : null}
                  Issue credential
                </Button>
              </DialogFooter>
            </FieldGroup>
          </form>
        )}
        {issuedKey ? (
          <DialogFooter>
            <Button disabled={!keyAcknowledged} onClick={() => changeOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function OneTimeKeyDialog({
  open,
  credentialKey,
  acknowledged,
  setAcknowledged,
  onClose,
  title,
}: {
  readonly open: boolean;
  readonly credentialKey: string | null;
  readonly acknowledged: boolean;
  readonly setAcknowledged: (checked: boolean) => void;
  readonly onClose: () => void;
  readonly title: string;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && acknowledged) onClose();
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            The raw key is shown once. Copy it before closing this dialog.
          </DialogDescription>
        </DialogHeader>
        {credentialKey ? (
          <OneTimeKeyContent
            credentialKey={credentialKey}
            acknowledged={acknowledged}
            setAcknowledged={setAcknowledged}
          />
        ) : null}
        <DialogFooter>
          <Button disabled={!acknowledged} onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OneTimeKeyContent({
  credentialKey,
  acknowledged,
  setAcknowledged,
}: {
  readonly credentialKey: string;
  readonly acknowledged: boolean;
  readonly setAcknowledged: (checked: boolean) => void;
}) {
  async function copyKey() {
    await navigator.clipboard.writeText(credentialKey);
    toast.success("Credential copied.");
  }

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="one-time-credential">One-time credential</FieldLabel>
        <Input
          id="one-time-credential"
          name="one-time-credential"
          readOnly
          value={credentialKey}
          autoComplete="off"
          spellCheck={false}
          translate="no"
        />
      </Field>
      <Button type="button" variant="outline" onClick={() => void copyKey()}>
        <CopyIcon data-icon="inline-start" />
        Copy credential
      </Button>
      <Field orientation="horizontal">
        <Checkbox id="credential-saved" checked={acknowledged} onCheckedChange={setAcknowledged} />
        <FieldLabel htmlFor="credential-saved">I saved this credential securely.</FieldLabel>
      </Field>
    </FieldGroup>
  );
}
