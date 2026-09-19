// Renders permission-aware project membership, invitation, locale-access, and credential controls.

import type {
  ApiCredential,
  ApiCredentialRotation,
  CredentialFamily,
  CredentialScope,
  LocaleAccessMode,
  ProjectInvitation,
  ProjectInvitationListStatus,
  ProjectLocaleAccess,
  ProjectMember,
  ProjectPermissionAction,
  ProjectRole,
} from "@framerfordevs/api/contracts/access/index";
import type { ProjectLocale } from "@framerfordevs/api/contracts/locale/index";
import { Alert, AlertDescription, AlertTitle } from "@framerfordevs/ui/components/alert";
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
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CopyIcon,
  KeyRoundIcon,
  RefreshCwIcon,
  ShieldIcon,
  Trash2Icon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { buildInvitationLink } from "@/lib/auth/invitation-link";
import { client, orpc } from "@/utils/orpc";

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

function applicationErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("data" in error) return applicationErrorCode(error.data);
  if ("error" in error) return applicationErrorCode(error.error);
  return undefined;
}

function credentialSecretErrorMessage(error: unknown, operation: "issue" | "rotation") {
  const code = applicationErrorCode(error);
  if (code === undefined || code === "INTERNAL_SERVER_ERROR" || code === "SERVICE_UNAVAILABLE") {
    return operation === "issue"
      ? "The issue result is uncertain. Refresh credentials, revoke any unknown key, and explicitly issue a replacement. Do not retry blindly."
      : "The rotation result is uncertain. Refresh credentials, cancel any pending replacement whose key was lost, and explicitly start again. Do not retry blindly.";
  }
  return error instanceof Error ? error.message : "The credential operation failed.";
}

export function governanceErrorMessage(error: unknown, ambiguousInvitation = false): string {
  const code = applicationErrorCode(error);
  switch (code) {
    case "LAST_OWNER_REQUIRED":
      return "Add or promote another owner, refresh members, and then retry.";
    case "VERSION_CONFLICT":
      return "This record changed. Refresh the list and retry with its latest version.";
    case "LOCALE_UNAVAILABLE":
      return "A selected locale is unavailable. Refresh locales and choose only enabled locales.";
    case "INVITATION_CONFLICT":
      return "This email is already a member or has a pending invitation. Search and revoke the pending invitation before reissuing.";
    default:
      if (ambiguousInvitation && (code === undefined || code === "INTERNAL_SERVER_ERROR")) {
        return "The invitation result is uncertain. Search this email, revoke any pending invitation, and then reissue instead of retrying blindly.";
      }
      return error instanceof Error ? error.message : "The governance operation failed.";
  }
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

function localeAccessLabel(
  access: ProjectLocaleAccess,
  projectLocales: ReadonlyArray<ProjectLocale>,
): string {
  if (access.mode === "all") return "All locales";
  if (access.mode === "none") return "No locales";
  const labels = new Map(projectLocales.map((locale) => [locale.id, locale.displayName]));
  return access.localeIds.map((localeId) => labels.get(localeId) ?? localeId).join(", ");
}

interface ProjectAccessSettingsProps {
  readonly projectId: string;
  readonly environmentId: string;
  readonly role: ProjectRole;
  readonly localeAccessMode: LocaleAccessMode;
  readonly effectiveProjectActions: ReadonlyArray<ProjectPermissionAction>;
  readonly isArchived?: boolean;
}

export function ProjectAccessSettings({
  projectId,
  environmentId,
  role,
  localeAccessMode,
  effectiveProjectActions,
  isArchived = false,
}: ProjectAccessSettingsProps) {
  const actions = new Set(effectiveProjectActions);
  const canReadMembers = actions.has("project.member.read");
  const canInvite = actions.has("project.member.invite");
  const canMutateMembers =
    actions.has("project.member.role.update") && actions.has("project.member.remove");
  const canUpdateLocaleAccess = actions.has("project.member.locale.update");
  const canReadCredentials = actions.has("project.credential.read");
  const hasRestrictedLocaleAccess = localeAccessMode !== "all";
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
                  canUpdateLocaleAccess={canUpdateLocaleAccess}
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
                  localeRestricted={hasRestrictedLocaleAccess}
                  isArchived={isArchived}
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
  canUpdateLocaleAccess,
}: {
  readonly projectId: string;
  readonly canInvite: boolean;
  readonly canMutate: boolean;
  readonly canUpdateLocaleAccess: boolean;
}) {
  const [memberRole, setMemberRole] = useState<"all" | ProjectRole>("all");
  const [memberSearchDraft, setMemberSearchDraft] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [invitationStatus, setInvitationStatus] = useState<ProjectInvitationListStatus>("all");
  const [invitationSearchDraft, setInvitationSearchDraft] = useState("");
  const [invitationSearch, setInvitationSearch] = useState("");
  const members = useInfiniteQuery(
    orpc.platform.projects.members.list.infiniteOptions({
      input: (cursor: string | null) => ({
        projectId,
        role: memberRole === "all" ? null : memberRole,
        search: memberSearch === "" ? null : memberSearch,
        cursor,
        limit: 20,
      }),
      initialPageParam: null,
      getNextPageParam: (lastPage) => lastPage.data.nextCursor ?? undefined,
      maxPages: 10,
    }),
  );
  const invitations = useInfiniteQuery(
    orpc.platform.projects.invitations.list.infiniteOptions({
      input: (cursor: string | null) => ({
        projectId,
        status: invitationStatus,
        search: invitationSearch === "" ? null : invitationSearch,
        cursor,
        limit: 20,
      }),
      initialPageParam: null,
      getNextPageParam: (lastPage) => lastPage.data.nextCursor ?? undefined,
      maxPages: 10,
    }),
  );
  const localeQuery = useQuery({
    ...orpc.platform.projects.locales.list.queryOptions({
      input: { projectId, view: "settings", includeRemoved: true },
    }),
    enabled: canUpdateLocaleAccess,
  });
  const projectLocales = localeQuery.data?.data.items ?? [];
  const memberItems = members.data?.pages.flatMap((page) => page.data.items) ?? [];
  const invitationItems = invitations.data?.pages.flatMap((page) => page.data.items) ?? [];

  if (
    members.isPending ||
    invitations.isPending ||
    (canUpdateLocaleAccess && localeQuery.isPending)
  ) {
    return (
      <div className="flex items-center gap-2" role="status" aria-label="Loading project members">
        <Spinner />
        <span className="text-muted-foreground text-sm">Loading members…</span>
      </div>
    );
  }

  const canRenderLocaleAccess = canUpdateLocaleAccess && !localeQuery.isError;
  const memberFiltersActive = memberRole !== "all" || memberSearch !== "";
  const invitationFiltersActive = invitationStatus !== "all" || invitationSearch !== "";

  return (
    <div className="flex flex-col gap-6">
      {canUpdateLocaleAccess && localeQuery.isError ? (
        <div
          className="flex flex-col items-start gap-2 border border-destructive/40 p-3"
          role="alert"
        >
          <p className="text-sm font-medium">Member locale controls could not be loaded.</p>
          <Button size="sm" variant="outline" onClick={() => void localeQuery.refetch()}>
            Try again
          </Button>
        </div>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-medium">Project members</h3>
          <p className="text-muted-foreground text-sm">
            Membership changes take effect immediately and preserve audit history.
          </p>
        </div>
        {canInvite ? (
          <InviteMemberDialog projectId={projectId} projectLocales={projectLocales} />
        ) : null}
      </div>

      <form
        className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end"
        aria-label="Filter project members"
        onSubmit={(event) => {
          event.preventDefault();
          setMemberSearch(memberSearchDraft.trim());
        }}
      >
        <Field>
          <FieldLabel htmlFor="member-search">Member name or email prefix</FieldLabel>
          <Input
            id="member-search"
            type="search"
            maxLength={100}
            value={memberSearchDraft}
            onChange={(event) => setMemberSearchDraft(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="member-role-filter">Role</FieldLabel>
          <NativeSelect
            id="member-role-filter"
            value={memberRole}
            onChange={(event) => {
              const value = event.target.value;
              if (value === "all") setMemberRole("all");
              else {
                const role = parseProjectRole(value);
                if (role) setMemberRole(role);
              }
            }}
          >
            <NativeSelectOption value="all">All roles</NativeSelectOption>
            {projectRoles.map((value) => (
              <NativeSelectOption key={value} value={value}>
                {roleLabels[value]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <div className="flex gap-2">
          <Button type="submit" variant="outline">
            Search
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setMemberRole("all");
              setMemberSearchDraft("");
              setMemberSearch("");
            }}
          >
            Clear
          </Button>
        </div>
      </form>

      {memberItems.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>
              {memberFiltersActive ? "No matching project members" : "No project members"}
            </EmptyTitle>
            <EmptyDescription>
              {memberFiltersActive
                ? "Clear or change the member filters to continue."
                : "Invite a collaborator to establish project access."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
          {memberItems.map((member) => (
            <MemberRow
              key={member.id}
              projectId={projectId}
              member={member}
              canMutate={canMutate}
              canUpdateLocaleAccess={canRenderLocaleAccess}
              projectLocales={projectLocales}
            />
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
        <form
          className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end"
          aria-label="Filter project invitations"
          onSubmit={(event) => {
            event.preventDefault();
            setInvitationSearch(invitationSearchDraft.trim());
          }}
        >
          <Field>
            <FieldLabel htmlFor="invitation-search">Invitation email prefix</FieldLabel>
            <Input
              id="invitation-search"
              type="search"
              maxLength={100}
              value={invitationSearchDraft}
              onChange={(event) => setInvitationSearchDraft(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="invitation-status-filter">Status</FieldLabel>
            <NativeSelect
              id="invitation-status-filter"
              value={invitationStatus}
              onChange={(event) => {
                const status = event.target.value;
                if (
                  status === "all" ||
                  status === "pending" ||
                  status === "accepted" ||
                  status === "revoked" ||
                  status === "expired"
                ) {
                  setInvitationStatus(status);
                }
              }}
            >
              <NativeSelectOption value="all">All statuses</NativeSelectOption>
              <NativeSelectOption value="pending">Pending</NativeSelectOption>
              <NativeSelectOption value="accepted">Accepted</NativeSelectOption>
              <NativeSelectOption value="revoked">Revoked</NativeSelectOption>
              <NativeSelectOption value="expired">Expired</NativeSelectOption>
            </NativeSelect>
          </Field>
          <div className="flex gap-2">
            <Button type="submit" variant="outline">
              Search
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setInvitationStatus("all");
                setInvitationSearchDraft("");
                setInvitationSearch("");
              }}
            >
              Clear
            </Button>
          </div>
        </form>
        {invitationItems.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {invitationFiltersActive
              ? "No invitations match the current filters."
              : "No invitations have been created."}
          </p>
        ) : (
          invitationItems.map((invitation) => (
            <InvitationRow
              key={invitation.id}
              invitation={invitation}
              projectLocales={projectLocales}
              canRevoke={canInvite}
            />
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
  projectId,
  member,
  canMutate,
  canUpdateLocaleAccess,
  projectLocales,
}: {
  readonly projectId: string;
  readonly member: ProjectMember;
  readonly canMutate: boolean;
  readonly canUpdateLocaleAccess: boolean;
  readonly projectLocales: ReadonlyArray<ProjectLocale>;
}) {
  return (
    <div className="flex flex-col gap-3 border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{member.name}</p>
        <p className="text-muted-foreground truncate text-sm">{member.email}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{roleLabels[member.role]}</Badge>
        {canMutate || canUpdateLocaleAccess ? (
          <MemberActions
            projectId={projectId}
            member={member}
            canMutate={canMutate}
            canUpdateLocaleAccess={canUpdateLocaleAccess}
            projectLocales={projectLocales}
          />
        ) : null}
      </div>
    </div>
  );
}

function MemberActions({
  projectId,
  member,
  canMutate,
  canUpdateLocaleAccess,
  projectLocales,
}: {
  readonly projectId: string;
  readonly member: ProjectMember;
  readonly canMutate: boolean;
  readonly canUpdateLocaleAccess: boolean;
  readonly projectLocales: ReadonlyArray<ProjectLocale>;
}) {
  const queryClient = useQueryClient();
  const remove = useMutation(
    orpc.platform.projects.members.remove.mutationOptions({
      onSuccess: async (response) => {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: orpc.platform.projects.members.key(),
          }),
          queryClient.invalidateQueries({
            queryKey: orpc.platform.projects.key(),
          }),
        ]);
        toast.success(response.message);
      },
      onError: async (error) => {
        await queryClient.invalidateQueries({
          queryKey: orpc.platform.projects.members.key(),
        });
        toast.error(governanceErrorMessage(error));
      },
    }),
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canUpdateLocaleAccess ? (
        <LocaleAccessDialog
          projectId={projectId}
          member={member}
          projectLocales={projectLocales}
          canUpdateRole={canMutate}
        />
      ) : null}
      {canMutate ? (
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
                onClick={() =>
                  remove.mutate({
                    projectId: member.projectId,
                    membershipId: member.id,
                    version: member.version,
                  })
                }
              >
                {remove.isPending ? <Spinner data-icon="inline-start" /> : null}
                Remove member
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  );
}

export function LocaleAccessDialog({
  projectId,
  member,
  projectLocales,
  canUpdateRole = false,
}: {
  readonly projectId: string;
  readonly member: ProjectMember;
  readonly projectLocales: ReadonlyArray<ProjectLocale>;
  readonly canUpdateRole?: boolean;
}) {
  const queryClient = useQueryClient();
  const configuredLocaleIds =
    member.localeAccess.mode === "selected" ? member.localeAccess.localeIds : [];
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<ProjectRole>(member.role);
  const [mode, setMode] = useState<LocaleAccessMode>(member.localeAccess.mode);
  const [localeIds, setLocaleIds] =
    useState<ReadonlyArray<ProjectLocale["id"]>>(configuredLocaleIds);
  const [acknowledged, setAcknowledged] = useState(false);
  const update = useMutation(
    orpc.platform.projects.members.updatePolicy.mutationOptions({
      onSuccess: async (response) => {
        setOpen(false);
        setAcknowledged(false);
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: orpc.platform.projects.members.key(),
          }),
          queryClient.invalidateQueries({
            queryKey: orpc.platform.projects.access.key(),
          }),
        ]);
        toast.success(response.message);
      },
      onError: async (error) => {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: orpc.platform.projects.members.key(),
          }),
          queryClient.invalidateQueries({
            queryKey: orpc.platform.projects.locales.key(),
          }),
        ]);
        toast.error(governanceErrorMessage(error));
      },
    }),
  );
  const reducingAccess =
    (member.role === "owner" && role !== "owner") ||
    (member.localeAccess.mode === "all" && mode !== "all") ||
    (member.localeAccess.mode === "selected" &&
      (mode === "none" ||
        (mode === "selected" &&
          configuredLocaleIds.some((localeId) => !localeIds.includes(localeId)))));
  const accessChanged =
    role !== member.role ||
    mode !== member.localeAccess.mode ||
    (mode === "selected" &&
      member.localeAccess.mode === "selected" &&
      (localeIds.length !== configuredLocaleIds.length ||
        localeIds.some((localeId) => !configuredLocaleIds.includes(localeId))));
  const canSubmit =
    accessChanged &&
    (role !== "owner" || mode === "all") &&
    (mode !== "selected" || localeIds.length > 0) &&
    (!reducingAccess || acknowledged);

  function toggleLocale(localeId: ProjectLocale["id"], checked: boolean) {
    setLocaleIds((current) =>
      checked ? [...current, localeId] : current.filter((value) => value !== localeId),
    );
  }

  function changeOpen(nextOpen: boolean) {
    if (nextOpen) {
      setRole(member.role);
      setMode(member.localeAccess.mode);
      setLocaleIds(configuredLocaleIds);
      setAcknowledged(false);
    }
    setOpen(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger
        render={
          <Button
            size="sm"
            variant="outline"
            disabled={member.role === "owner" && !canUpdateRole}
          />
        }
      >
        {canUpdateRole ? "Member policy" : "Locale access"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {canUpdateRole
              ? `Member policy for ${member.name}`
              : `Locale access for ${member.name}`}
          </DialogTitle>
          <DialogDescription>
            Role and locale access are saved together as one optimistic policy update. Restrictions
            are enforced server-side, and owners always retain all locales.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          {canUpdateRole ? (
            <Field>
              <FieldLabel htmlFor={`member-policy-role-${member.id}`}>Role</FieldLabel>
              <NativeSelect
                id={`member-policy-role-${member.id}`}
                className="w-full"
                value={role}
                onChange={(event) => {
                  const nextRole = parseProjectRole(event.target.value);
                  if (nextRole) {
                    setRole(nextRole);
                    if (nextRole === "owner") setMode("all");
                    setAcknowledged(false);
                  }
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
          ) : null}
          <Field>
            <FieldLabel htmlFor={`locale-access-mode-${member.id}`}>Access mode</FieldLabel>
            <NativeSelect
              id={`locale-access-mode-${member.id}`}
              className="w-full"
              value={mode}
              disabled={role === "owner"}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "all" || value === "selected" || value === "none") {
                  setMode(value);
                  setAcknowledged(false);
                }
              }}
            >
              <NativeSelectOption value="all">All enabled locales</NativeSelectOption>
              <NativeSelectOption value="selected">Selected enabled locales</NativeSelectOption>
              <NativeSelectOption value="none">No locale-scoped content access</NativeSelectOption>
            </NativeSelect>
          </Field>
          {mode === "selected" ? (
            <FieldSet>
              <FieldLegend>Project locales</FieldLegend>
              <div data-slot="checkbox-group" className="grid gap-3 sm:grid-cols-2">
                {projectLocales.map((locale) => (
                  <Field key={locale.id} orientation="horizontal">
                    <Checkbox
                      id={`member-${member.id}-locale-${locale.id}`}
                      checked={localeIds.includes(locale.id)}
                      disabled={locale.status !== "enabled"}
                      onCheckedChange={(checked) => toggleLocale(locale.id, checked)}
                    />
                    <FieldLabel htmlFor={`member-${member.id}-locale-${locale.id}`}>
                      {locale.displayName} ({locale.tag})
                      {locale.status === "enabled" ? "" : ` · ${locale.status}`}
                    </FieldLabel>
                  </Field>
                ))}
              </div>
              {localeIds.length === 0 ? <FieldError>Select at least one locale.</FieldError> : null}
            </FieldSet>
          ) : null}
          {reducingAccess ? (
            <Field orientation="horizontal">
              <Checkbox
                id={`locale-access-confirm-${member.id}`}
                checked={acknowledged}
                onCheckedChange={setAcknowledged}
              />
              <FieldLabel htmlFor={`locale-access-confirm-${member.id}`}>
                I understand this immediately reduces the member&apos;s server-side access.
              </FieldLabel>
            </Field>
          ) : null}
        </FieldGroup>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => changeOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={!canSubmit || update.isPending}
            onClick={() =>
              update.mutate({
                projectId,
                membershipId: member.id,
                version: member.version,
                role,
                localeAccess:
                  mode === "selected"
                    ? { mode, localeIds }
                    : mode === "all"
                      ? { mode: "all" }
                      : { mode: "none" },
              })
            }
          >
            {update.isPending ? <Spinner data-icon="inline-start" /> : null}
            {canUpdateRole ? "Save member policy" : "Save locale access"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InvitationRow({
  invitation,
  projectLocales,
  canRevoke,
}: {
  readonly invitation: ProjectInvitation;
  readonly projectLocales: ReadonlyArray<ProjectLocale>;
  readonly canRevoke: boolean;
}) {
  const queryClient = useQueryClient();
  const revoke = useMutation(
    orpc.platform.projects.invitations.revoke.mutationOptions({
      onSuccess: async (response) => {
        await queryClient.invalidateQueries({
          queryKey: orpc.platform.projects.invitations.key(),
        });
        toast.success(response.message);
      },
      onError: async (error) => {
        await queryClient.invalidateQueries({
          queryKey: orpc.platform.projects.invitations.key(),
        });
        toast.error(governanceErrorMessage(error));
      },
    }),
  );

  return (
    <div className="flex flex-col gap-3 border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{invitation.email}</p>
        <p className="text-muted-foreground text-sm">
          {roleLabels[invitation.role]} ·{" "}
          {localeAccessLabel(invitation.localeAccess, projectLocales)}
          {" · Expires "}
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
              revoke.mutate({
                projectId: invitation.projectId,
                invitationId: invitation.id,
                version: invitation.version,
              })
            }
          >
            Revoke
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function InviteMemberDialog({
  projectId,
  projectLocales,
  createInvitation = (input) => client.platform.projects.invitations.create(input),
}: {
  readonly projectId: string;
  readonly projectLocales: ReadonlyArray<ProjectLocale>;
  readonly createInvitation?: typeof client.platform.projects.invitations.create;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ProjectRole>("client_editor");
  const [localeAccessMode, setLocaleAccessMode] = useState<LocaleAccessMode>("all");
  const [localeIds, setLocaleIds] = useState<ReadonlyArray<ProjectLocale["id"]>>([]);
  const [invitationLink, setInvitationLink] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  async function submitInvitation() {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const response = await createInvitation({
        projectId,
        email,
        role,
        localeAccess:
          localeAccessMode === "selected"
            ? { mode: "selected", localeIds }
            : localeAccessMode === "all"
              ? { mode: "all" }
              : { mode: "none" },
      });
      const link = buildInvitationLink(window.location.origin, response.data.token);
      setInvitationLink(link);
      void queryClient.invalidateQueries({
        queryKey: orpc.platform.projects.invitations.key(),
      });
    } catch (error) {
      await queryClient.invalidateQueries({
        queryKey: orpc.platform.projects.invitations.key(),
      });
      toast.error(governanceErrorMessage(error, true));
    } finally {
      setIsCreating(false);
    }
  }

  function reset() {
    setEmail("");
    setRole("client_editor");
    setLocaleAccessMode("all");
    setLocaleIds([]);
    setInvitationLink(null);
    setAcknowledged(false);
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

  function toggleLocale(localeId: ProjectLocale["id"], checked: boolean) {
    setLocaleIds((current) =>
      checked ? [...current, localeId] : current.filter((value) => value !== localeId),
    );
  }

  const canCreate =
    email.trim() !== "" &&
    (localeAccessMode !== "selected" || localeIds.length > 0) &&
    (role !== "owner" || localeAccessMode === "all");

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
              void submitInvitation();
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
                    if (nextRole) {
                      setRole(nextRole);
                      if (nextRole === "owner") setLocaleAccessMode("all");
                    }
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
              <Field>
                <FieldLabel htmlFor="invitation-locale-access">Locale access</FieldLabel>
                <NativeSelect
                  id="invitation-locale-access"
                  className="w-full"
                  value={localeAccessMode}
                  disabled={role === "owner"}
                  onChange={(event) => {
                    const mode = event.target.value;
                    if (mode === "all" || mode === "selected" || mode === "none") {
                      setLocaleAccessMode(mode);
                    }
                  }}
                >
                  <NativeSelectOption value="all">All enabled locales</NativeSelectOption>
                  <NativeSelectOption value="selected">Selected enabled locales</NativeSelectOption>
                  <NativeSelectOption value="none">
                    No locale-scoped content access
                  </NativeSelectOption>
                </NativeSelect>
                {role === "owner" ? (
                  <FieldDescription>Owners always receive all-locale access.</FieldDescription>
                ) : null}
              </Field>
              {localeAccessMode === "selected" ? (
                <FieldSet>
                  <FieldLegend>Enabled project locales</FieldLegend>
                  <div data-slot="checkbox-group" className="grid gap-3 sm:grid-cols-2">
                    {projectLocales.map((locale) => (
                      <Field key={locale.id} orientation="horizontal">
                        <Checkbox
                          id={`invitation-locale-${locale.id}`}
                          checked={localeIds.includes(locale.id)}
                          disabled={locale.status !== "enabled"}
                          onCheckedChange={(checked) => toggleLocale(locale.id, checked)}
                        />
                        <FieldLabel htmlFor={`invitation-locale-${locale.id}`}>
                          {locale.displayName} ({locale.tag})
                          {locale.status === "enabled" ? "" : ` · ${locale.status}`}
                        </FieldLabel>
                      </Field>
                    ))}
                  </div>
                  {localeIds.length === 0 ? (
                    <FieldError>Select at least one enabled locale.</FieldError>
                  ) : null}
                </FieldSet>
              ) : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => changeOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isCreating || !canCreate}>
                  {isCreating ? <Spinner data-icon="inline-start" /> : null}
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

type CredentialStatusFilter =
  | "all"
  | "pending"
  | "active"
  | "retiring"
  | "expired"
  | "revoked"
  | "canceled";

function CredentialsPanel({
  projectId,
  environmentId,
  canIssue,
  canRotate,
  canRevoke,
  localeRestricted,
  isArchived,
}: {
  readonly projectId: string;
  readonly environmentId: string;
  readonly canIssue: boolean;
  readonly canRotate: boolean;
  readonly canRevoke: boolean;
  readonly localeRestricted: boolean;
  readonly isArchived: boolean;
}) {
  const [familyFilter, setFamilyFilter] = useState<"all" | CredentialFamily>("all");
  const [statusFilter, setStatusFilter] = useState<CredentialStatusFilter>("all");
  const credentials = useInfiniteQuery(
    orpc.platform.projects.credentials.operationalList.infiniteOptions({
      input: (cursor: string | null) => ({
        projectId,
        environmentId,
        query: {
          family: familyFilter,
          status: statusFilter,
          cursor,
          limit: 20,
        },
      }),
      initialPageParam: null,
      getNextPageParam: (lastPage) => lastPage.data.nextCursor ?? undefined,
      maxPages: 10,
    }),
  );
  const items = credentials.data?.pages.flatMap((page) => page.data.items) ?? [];

  if (credentials.isPending) {
    return (
      <div className="flex items-center gap-2" role="status" aria-label="Loading API credentials">
        <Spinner />
        <span className="text-muted-foreground text-sm">Loading credentials…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {localeRestricted ? (
        <p className="border border-amber-300 bg-amber-50 p-3 text-amber-950 text-sm dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          Issuing and rotating credentials is unavailable while your membership has restricted
          locale access.
        </p>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-medium">Environment credentials</h3>
          <p className="text-muted-foreground text-sm">
            Management, delivery, and preview authority never overlap.
          </p>
        </div>
        {canIssue && !isArchived ? (
          <IssueCredentialDialog projectId={projectId} environmentId={environmentId} />
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2" aria-label="Filter API credentials">
        <Field>
          <FieldLabel htmlFor="credential-family-filter">Family</FieldLabel>
          <NativeSelect
            id="credential-family-filter"
            value={familyFilter}
            onChange={(event) => {
              const value = event.target.value;
              if (value === "all") setFamilyFilter("all");
              else {
                const family = parseCredentialFamily(value);
                if (family) setFamilyFilter(family);
              }
            }}
          >
            <NativeSelectOption value="all">All families</NativeSelectOption>
            <NativeSelectOption value="management">Management</NativeSelectOption>
            <NativeSelectOption value="delivery">Delivery</NativeSelectOption>
            <NativeSelectOption value="preview">Preview</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="credential-status-filter">Status</FieldLabel>
          <NativeSelect
            id="credential-status-filter"
            value={statusFilter}
            onChange={(event) => {
              const value = event.target.value;
              if (
                value === "all" ||
                value === "pending" ||
                value === "active" ||
                value === "retiring" ||
                value === "expired" ||
                value === "revoked" ||
                value === "canceled"
              ) {
                setStatusFilter(value);
              }
            }}
          >
            <NativeSelectOption value="all">All statuses</NativeSelectOption>
            <NativeSelectOption value="pending">Pending</NativeSelectOption>
            <NativeSelectOption value="active">Active</NativeSelectOption>
            <NativeSelectOption value="retiring">Retiring</NativeSelectOption>
            <NativeSelectOption value="expired">Expired</NativeSelectOption>
            <NativeSelectOption value="revoked">Revoked</NativeSelectOption>
            <NativeSelectOption value="canceled">Canceled</NativeSelectOption>
          </NativeSelect>
        </Field>
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
              canStartRotation={canRotate && !isArchived}
              canChangeRotation={canRotate}
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

export function CredentialRow({
  credential,
  canStartRotation,
  canChangeRotation,
  canRotate,
  canRevoke,
}: {
  readonly credential: Omit<ApiCredential, "workspaceId" | "keyPrefix"> & {
    readonly keyPrefix: string;
    readonly openRotation?: ApiCredentialRotation | null;
  };
  readonly canStartRotation?: boolean;
  readonly canChangeRotation?: boolean;
  readonly canRotate?: boolean;
  readonly canRevoke: boolean;
}) {
  const mayStartRotation = canStartRotation ?? canRotate ?? false;
  const mayChangeRotation = canChangeRotation ?? canRotate ?? false;
  const queryClient = useQueryClient();
  const rowRef = useRef<HTMLDivElement>(null);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [revokePrefix, setRevokePrefix] = useState("");
  const rotate = useMutation(
    orpc.platform.projects.credentials.rotation.start.mutationOptions({
      onSuccess: async (response) => {
        setRevealedKey(response.data.key);
        await queryClient.invalidateQueries({
          queryKey: orpc.platform.projects.credentials.key(),
        });
      },
      onError: (error) => toast.error(credentialSecretErrorMessage(error, "rotation")),
    }),
  );
  const changeRotation = useMutation(
    orpc.platform.projects.credentials.rotation.change.mutationOptions({
      onSuccess: async (response) => {
        await queryClient.invalidateQueries({
          queryKey: orpc.platform.projects.credentials.key(),
        });
        toast.success(response.message);
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const revoke = useMutation(
    orpc.platform.projects.credentials.revoke.mutationOptions({
      onSuccess: async (response) => {
        setRevokePrefix("");
        await queryClient.invalidateQueries({
          queryKey: orpc.platform.projects.credentials.key(),
        });
        toast.success(response.message);
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const predecessorRotation =
    credential.openRotation?.predecessorCredentialId === credential.id
      ? credential.openRotation
      : null;

  return (
    <div
      ref={rowRef}
      role="group"
      aria-label={`Credential ${credential.name}`}
      tabIndex={-1}
      className="flex flex-col gap-3 border p-3"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{credential.name}</p>
          <p className="text-muted-foreground truncate font-mono text-xs" translate="no">
            {credential.keyPrefix}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{credential.family}</Badge>
          <Badge
            variant={
              credential.status === "active" || credential.status === "retiring"
                ? "default"
                : "secondary"
            }
          >
            {credential.status}
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
        {credential.retireAt
          ? ` · Overlap retires ${dateFormatter.format(new Date(credential.retireAt))}`
          : ""}
      </p>
      {credential.family === "preview" && !credential.expiresAt && !credential.revokedAt ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Legacy Preview credential blocked</AlertTitle>
          <AlertDescription>
            This non-expiring key now fails authentication and cannot rotate. Revoke it after
            issuing an acknowledged Preview replacement that expires within 30 days.
          </AlertDescription>
        </Alert>
      ) : null}
      {predecessorRotation && mayChangeRotation ? (
        <CredentialRotationActions
          credential={credential}
          rotation={predecessorRotation}
          pending={changeRotation.isPending}
          onAction={(action) =>
            changeRotation.mutate({
              projectId: credential.projectId,
              environmentId: credential.environmentId,
              rotationId: predecessorRotation.id,
              expectedVersion: predecessorRotation.version,
              action,
            })
          }
        />
      ) : null}
      {credential.status === "pending" && credential.openRotation ? (
        <p className="text-muted-foreground text-sm">
          This pending key remains unusable until its predecessor rotation is activated.
        </p>
      ) : null}
      {credential.status === "active" && (mayStartRotation || canRevoke) ? (
        <div className="flex flex-wrap gap-2">
          {mayStartRotation && !credential.openRotation ? (
            <AlertDialog>
              <AlertDialogTrigger render={<Button size="sm" variant="outline" />}>
                <RefreshCwIcon data-icon="inline-start" />
                Rotate
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Rotate {credential.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    A pending replacement is shown once and remains unusable until you activate the
                    24-hour overlap.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={rotate.isPending}
                    onClick={() =>
                      rotate.mutate({
                        projectId: credential.projectId,
                        environmentId: credential.environmentId,
                        credentialId: credential.id,
                        expectedVersion: credential.version,
                        expiresAt: credential.expiresAt,
                        nonExpiringAcknowledged: credential.expiresAt === null,
                      })
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
                    Revocation is immediate and cannot be undone.
                    {credential.openRotation
                      ? " Every pending or usable key in this open rotation will also be closed."
                      : " Issue a new key if access is needed later."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Field>
                  <FieldLabel htmlFor={`credential-revoke-prefix-${credential.id}`}>
                    Type the displayed credential prefix to confirm
                  </FieldLabel>
                  <Input
                    id={`credential-revoke-prefix-${credential.id}`}
                    autoComplete="off"
                    value={revokePrefix}
                    onChange={(event) => setRevokePrefix(event.target.value)}
                  />
                </Field>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    disabled={revoke.isPending || revokePrefix !== credential.keyPrefix}
                    onClick={() =>
                      revoke.mutate({
                        projectId: credential.projectId,
                        environmentId: credential.environmentId,
                        credentialId: credential.id,
                        expectedVersion: credential.version,
                      })
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
          requestAnimationFrame(() => rowRef.current?.focus());
        }}
        title="Copy rotated credential"
      />
    </div>
  );
}

function CredentialRotationActions({
  credential,
  rotation,
  pending,
  onAction,
}: {
  readonly credential: Pick<ApiCredential, "name">;
  readonly rotation: ApiCredentialRotation;
  readonly pending: boolean;
  readonly onAction: (action: "activate" | "cancel" | "complete") => void;
}) {
  const actions: ReadonlyArray<"activate" | "cancel" | "complete"> =
    rotation.status === "pending"
      ? ["activate", "cancel"]
      : rotation.status === "overlap"
        ? ["complete"]
        : [];
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => {
        const destructive = action === "cancel" || action === "complete";
        const title =
          action === "activate"
            ? `Activate replacement for ${credential.name}?`
            : action === "complete"
              ? `Complete rotation for ${credential.name}?`
              : `Cancel rotation for ${credential.name}?`;
        const description =
          action === "activate"
            ? "The pending key becomes usable immediately and both keys overlap for no more than 24 hours."
            : action === "complete"
              ? "The predecessor key is revoked immediately. This cannot be undone."
              : "The pending replacement is revoked without changing the active predecessor key.";
        return (
          <AlertDialog key={action}>
            <AlertDialogTrigger
              render={<Button size="sm" variant={destructive ? "destructive" : "outline"} />}
            >
              {action === "activate"
                ? "Activate replacement"
                : action === "complete"
                  ? "Complete rotation"
                  : "Cancel rotation"}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{title}</AlertDialogTitle>
                <AlertDialogDescription>{description}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>Keep current state</AlertDialogCancel>
                <AlertDialogAction
                  variant={destructive ? "destructive" : "default"}
                  disabled={pending}
                  onClick={() => onAction(action)}
                >
                  {pending ? <Spinner data-icon="inline-start" /> : null}
                  Confirm {action}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        );
      })}
    </div>
  );
}

function defaultExpiryLocal(days = 90): string {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1_000);
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
  const [previewAuthorityAcknowledged, setPreviewAuthorityAcknowledged] = useState(false);
  const [issuedKey, setIssuedKey] = useState<string | null>(null);
  const [keyAcknowledged, setKeyAcknowledged] = useState(false);
  const issue = useMutation(
    orpc.platform.projects.credentials.issue.mutationOptions({
      onSuccess: async (response) => {
        setIssuedKey(response.data.key);
        await queryClient.invalidateQueries({
          queryKey: orpc.platform.projects.credentials.key(),
        });
      },
      onError: (error) => toast.error(credentialSecretErrorMessage(error, "issue")),
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
    setExpiry(defaultExpiryLocal(nextFamily === "preview" ? 30 : 90));
    setNonExpiring(false);
    setNonExpiringAcknowledged(false);
    setPreviewAuthorityAcknowledged(false);
  }

  function reset() {
    setName("");
    setFamily("delivery");
    setScopes(["delivery.read"]);
    setExpiry(defaultExpiryLocal());
    setNonExpiring(false);
    setNonExpiringAcknowledged(false);
    setPreviewAuthorityAcknowledged(false);
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
  const previewExpiryAllowed =
    family !== "preview" ||
    (expiresAt !== null && new Date(expiresAt).getTime() - Date.now() <= 30 * 24 * 60 * 60 * 1_000);
  const canSubmit =
    name.trim() !== "" &&
    scopes.length > 0 &&
    (!nonExpiring || nonExpiringAcknowledged) &&
    (nonExpiring || expiresAt !== null) &&
    previewExpiryAllowed &&
    (family !== "preview" || previewAuthorityAcknowledged);

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
                previewAuthorityAcknowledged,
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
                      : "Environment-wide authenticated draft and revision preview reads only."}
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
              {family === "preview" ? (
                <Alert>
                  <AlertTitle>Complete environment draft authority</AlertTitle>
                  <AlertDescription>
                    This credential can read every current and historical unpublished draft,
                    including fields hidden from editor roles, in this environment. Store it only in
                    trusted server-side infrastructure. Preview credentials expire within 30 days.
                  </AlertDescription>
                </Alert>
              ) : null}
              {family === "preview" ? (
                <Field
                  orientation="horizontal"
                  data-invalid={!previewAuthorityAcknowledged || undefined}
                >
                  <Checkbox
                    id="credential-preview-authority-ack"
                    checked={previewAuthorityAcknowledged}
                    aria-invalid={!previewAuthorityAcknowledged}
                    onCheckedChange={setPreviewAuthorityAcknowledged}
                  />
                  <FieldLabel htmlFor="credential-preview-authority-ack">
                    I understand this Preview credential has complete environment-wide draft and
                    hidden-field read authority.
                  </FieldLabel>
                </Field>
              ) : null}
              <Field
                data-disabled={nonExpiring}
                data-invalid={(!nonExpiring && (!expiresAt || !previewExpiryAllowed)) || undefined}
              >
                <FieldLabel htmlFor="credential-expiry">Expiry</FieldLabel>
                <Input
                  id="credential-expiry"
                  name="credential-expiry"
                  type="datetime-local"
                  value={expiry}
                  disabled={nonExpiring}
                  required={!nonExpiring}
                  aria-invalid={!nonExpiring && (!expiresAt || !previewExpiryAllowed)}
                  onChange={(event) => setExpiry(event.target.value)}
                />
                <FieldDescription>
                  {family === "preview" ? "Required; maximum 30 days." : "Defaults to 90 days."}
                </FieldDescription>
                {!nonExpiring && expiresAt === null ? (
                  <FieldError>Choose a future expiry date and time.</FieldError>
                ) : null}
                {family === "preview" && expiresAt !== null && !previewExpiryAllowed ? (
                  <FieldError>Preview credentials cannot exceed 30 days.</FieldError>
                ) : null}
              </Field>
              {family !== "preview" ? (
                <Field orientation="horizontal">
                  <Checkbox
                    id="credential-non-expiring"
                    checked={nonExpiring}
                    onCheckedChange={(checked) => {
                      setNonExpiring(checked);
                      if (!checked) setNonExpiringAcknowledged(false);
                    }}
                  />
                  <FieldLabel htmlFor="credential-non-expiring">
                    Create without an expiry
                  </FieldLabel>
                </Field>
              ) : null}
              {family !== "preview" && nonExpiring ? (
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
