/** @vitest-environment jsdom */

// Verifies accessible semantics across platform management controls without owning component behavior.

import {
  ApiCredential,
  ApiCredentialRotation,
  IssuedProjectInvitation,
  ProjectInvitation,
  ProjectMember,
} from "@framerfordevs/api/contracts/access/index";
import { StudioRegistration } from "@framerfordevs/api/contracts/control-plane/index";
import { ProjectLocale } from "@framerfordevs/api/contracts/locale/index";
import { Project } from "@framerfordevs/api/contracts/platform/index";
import {
  EntryPublicationPage,
  EntryPublicationPlan,
  EntryPublicationStatus,
  EntryPublicationSummary,
} from "@framerfordevs/api/contracts/publication/index";
import { CollectionDraftSchema } from "@framerfordevs/api/contracts/schema/index";
import { WebhookEndpoint } from "@framerfordevs/api/contracts/webhook/index";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { Schema } from "effect";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ArchiveProjectDialog } from "@/components/project/archive-dialog";
import { CreateProjectDialog } from "@/components/project/create-dialog";
import { CreateWorkspaceDialog } from "@/components/create-workspace-dialog";
import { EditProjectDialog } from "@/components/project/edit-dialog";
import { RestoreProjectDialog } from "@/components/project/restore-dialog";
import { StudioRegistrationSettings } from "@/components/project/studio-registration";
import { LocaleTabs } from "@/components/entry/locale-tabs";
import {
  CredentialRow,
  InviteMemberDialog,
  IssueCredentialDialog,
  LocaleAccessDialog,
  ProjectAccessSettings,
  governanceErrorMessage,
} from "@/components/project/access-settings";
import { AddLocaleDialog } from "@/components/project/locale-settings";
import { CreateEntryDialog } from "@/components/entry/collection-entries";
import { PublicationCard, RenameEntryDialog } from "@/components/entry/editor";
import { CodeManagedStructureCard } from "@/components/collection-overview";
import {
  CreateInvalidationMappingDialog,
  CreateWebhookEndpointDialog,
  WebhookEndpointActions,
} from "@/components/webhook-controls";
import { orpc } from "@/utils/orpc";

const locale = Schema.decodeUnknownSync(ProjectLocale)({
  id: "019fae8b-1234-7000-8000-000000000004",
  workspaceId: "019fae8b-1234-7000-8000-000000000002",
  projectId: "019fae8b-1234-7000-8000-000000000001",
  tag: "en",
  displayName: "English",
  status: "enabled",
  position: 0,
  version: 1,
  createdAt: "2026-07-29T00:00:00.000Z",
  updatedAt: "2026-07-29T00:00:00.000Z",
});

const hindiLocale = Schema.decodeUnknownSync(ProjectLocale)({
  ...locale,
  id: "019fae8b-1234-7000-8000-000000000005",
  tag: "hi",
  displayName: "Hindi",
  position: 1,
});

const member = Schema.decodeUnknownSync(ProjectMember)({
  id: "019fae8b-1234-7000-8000-000000000006",
  projectId: "019fae8b-1234-7000-8000-000000000001",
  userId: "accessible-user",
  name: "Accessible member",
  email: "member@example.test",
  role: "editor",
  localeAccess: { mode: "all" },
  version: 1,
  removedAt: null,
  createdAt: "2026-07-29T00:00:00.000Z",
  updatedAt: "2026-07-29T00:00:00.000Z",
});

const acceptedInvitation = Schema.decodeUnknownSync(ProjectInvitation)({
  id: "019fae8b-1234-7000-8000-000000000007",
  projectId: "019fae8b-1234-7000-8000-000000000001",
  email: "accepted@example.test",
  role: "reviewer",
  localeAccess: { mode: "all" },
  status: "accepted",
  version: 2,
  expiresAt: "2026-09-23T00:00:00.000Z",
  acceptedAt: "2026-09-16T00:00:00.000Z",
  revokedAt: null,
  createdAt: "2026-09-15T00:00:00.000Z",
  updatedAt: "2026-09-16T00:00:00.000Z",
});

const project = Schema.decodeUnknownSync(Project)({
  id: "019fae8b-1234-7000-8000-000000000001",
  workspaceId: "019fae8b-1234-7000-8000-000000000002",
  name: "Accessible project",
  key: "accessible-project",
  description: "A project used for accessibility checks.",
  version: 1,
  archivedAt: null,
  createdAt: "2026-07-29T00:00:00.000Z",
  updatedAt: "2026-07-29T00:00:00.000Z",
  environment: {
    id: "019fae8b-1234-7000-8000-000000000003",
    workspaceId: "019fae8b-1234-7000-8000-000000000002",
    projectId: "019fae8b-1234-7000-8000-000000000001",
    key: "main",
    name: "main",
    isPrimary: true,
    createdAt: "2026-07-29T00:00:00.000Z",
  },
  capabilities: [],
});

const webhookEndpoint = Schema.decodeUnknownSync(WebhookEndpoint)({
  id: "019fae8b-1234-7000-8000-000000000071",
  projectId: project.id,
  environmentId: project.environment.id,
  name: "Publication receiver",
  state: "enabled",
  version: 1,
  destinationOrigin: "https://hooks.example.test",
  subscriptions: ["cms.schema.published", "cms.entry.published"],
  rotationState: "active",
  rotationEndsAt: null,
  lastOutcome: null,
  deadLetterCount: 0,
  enabledAt: "2026-08-12T00:00:00.000Z",
  disabledAt: null,
  createdAt: "2026-08-12T00:00:00.000Z",
  updatedAt: "2026-08-12T00:00:00.000Z",
});

const collectionDraft = Schema.decodeUnknownSync(CollectionDraftSchema)({
  formatVersion: 2,
  validationProfile: "ffd-fields@1",
  currencyRegistryProfile: null,
  contractHash: "b".repeat(64),
  editorLayout: {
    version: 1,
    tabs: [
      {
        id: "00000000-0000-4000-8000-000000000031",
        title: "Content",
        description: null,
        position: 0,
        visibleToRoles: ["owner", "developer"],
        groups: [
          {
            id: "00000000-0000-4000-8000-000000000032",
            title: "Main",
            description: null,
            position: 0,
            columns: 1,
            visibleToRoles: ["owner", "developer"],
            fields: [],
          },
        ],
      },
    ],
    sidebarGroups: [],
  },
  collection: {
    id: "019fae8b-1234-7000-8000-000000000010",
    workspaceId: project.workspaceId,
    projectId: project.id,
    environmentId: project.environment.id,
    apiKey: "articles",
    displayName: "Articles",
    description: null,
    version: 1,
    draftVersion: 2,
    draftBaseRevisionId: null,
    currentPublishedRevisionId: null,
    currentPublishedSequence: 0,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
  fields: [],
});

function renderWithQueryClient(component: ReactNode, queryClient = new QueryClient()) {
  return render(<QueryClientProvider client={queryClient}>{component}</QueryClientProvider>);
}

async function expectOpenDialogToHaveNoViolations(
  triggerName: RegExp,
  role: "alertdialog" | "dialog" = "dialog",
) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: triggerName }));
  const dialog = await screen.findByRole(role);
  expect((await axe.run(dialog)).violations).toEqual([]);
}

afterEach(cleanup);

describe("platform management accessibility", () => {
  it("has accessible workspace creation semantics", async () => {
    renderWithQueryClient(<CreateWorkspaceDialog />);
    await expectOpenDialogToHaveNoViolations(/new workspace/i);
  });

  it("has accessible project creation semantics", async () => {
    renderWithQueryClient(
      <CreateProjectDialog workspaceId={project.workspaceId} onCreated={() => undefined} />,
    );
    await expectOpenDialogToHaveNoViolations(/new project/i);
  });

  it("has accessible project editing semantics", async () => {
    renderWithQueryClient(<EditProjectDialog project={project} />);
    await expectOpenDialogToHaveNoViolations(/edit project/i);
  });

  it("has accessible destructive-confirmation semantics", async () => {
    renderWithQueryClient(<ArchiveProjectDialog project={project} />);
    await expectOpenDialogToHaveNoViolations(/archive project/i, "alertdialog");
  });

  it("has accessible project restoration semantics", async () => {
    renderWithQueryClient(
      <RestoreProjectDialog
        project={Schema.decodeUnknownSync(Project)({
          ...project,
          version: 2,
          archivedAt: "2026-08-14T00:00:00.000Z",
        })}
      />,
    );
    await expectOpenDialogToHaveNoViolations(/restore project/i, "alertdialog");
  });

  it("has accessible inert Studio registration semantics", async () => {
    const queryClient = new QueryClient();
    const registration = Schema.decodeUnknownSync(StudioRegistration)({
      id: "019fae8b-1234-7000-8000-000000000009",
      projectId: project.id,
      environmentId: project.environment.id,
      applicationOrigin: "https://studio.example.test",
      mountPath: "/studio",
      version: 1,
      createdAt: "2026-08-14T00:00:00.000Z",
      updatedAt: "2026-08-14T00:00:00.000Z",
    });
    const options = orpc.platform.projects.studioRegistration.get.queryOptions({
      input: { projectId: project.id, environmentId: project.environment.id },
    });
    queryClient.setQueryData(options.queryKey, {
      ok: true,
      data: registration,
      error: null,
      message: "Studio registration loaded.",
    });
    const { container } = renderWithQueryClient(
      <StudioRegistrationSettings project={project} canWrite />,
      queryClient,
    );

    expect(await screen.findByLabelText("Application origin")).toBeTruthy();
    expect(screen.getByLabelText("Mount path")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save registration" })).toBeTruthy();
    expect(
      screen.getByText(/grants no session, redirect, or browser credential authority/i),
    ).toBeTruthy();
    expect((await axe.run(container)).violations).toEqual([]);
  });

  it("keeps bounded member and invitation filters accessible", async () => {
    const queryClient = new QueryClient();
    const memberOptions = orpc.platform.projects.members.list.infiniteOptions({
      input: (cursor: string | null) => ({
        projectId: project.id,
        role: null,
        search: null,
        cursor,
        limit: 20,
      }),
      initialPageParam: null,
      getNextPageParam: (lastPage) => lastPage.data.nextCursor ?? undefined,
      maxPages: 10,
    });
    const filteredMemberOptions = orpc.platform.projects.members.list.infiniteOptions({
      input: (cursor: string | null) => ({
        projectId: project.id,
        role: "reviewer" as const,
        search: null,
        cursor,
        limit: 20,
      }),
      initialPageParam: null,
      getNextPageParam: (lastPage) => lastPage.data.nextCursor ?? undefined,
      maxPages: 10,
    });
    const invitationOptions = orpc.platform.projects.invitations.list.infiniteOptions({
      input: (cursor: string | null) => ({
        projectId: project.id,
        status: "all" as const,
        search: null,
        cursor,
        limit: 20,
      }),
      initialPageParam: null,
      getNextPageParam: (lastPage) => lastPage.data.nextCursor ?? undefined,
      maxPages: 10,
    });
    const filteredInvitationOptions = orpc.platform.projects.invitations.list.infiniteOptions({
      input: (cursor: string | null) => ({
        projectId: project.id,
        status: "pending" as const,
        search: null,
        cursor,
        limit: 20,
      }),
      initialPageParam: null,
      getNextPageParam: (lastPage) => lastPage.data.nextCursor ?? undefined,
      maxPages: 10,
    });
    const localeOptions = orpc.platform.projects.locales.list.queryOptions({
      input: { projectId: project.id, view: "settings", includeRemoved: true },
    });
    queryClient.setQueryData(memberOptions.queryKey, {
      pages: [
        {
          ok: true,
          data: { items: [member], nextCursor: null },
          error: null,
          message: "Members loaded.",
        },
      ],
      pageParams: [null],
    });
    queryClient.setQueryData(filteredMemberOptions.queryKey, {
      pages: [
        {
          ok: true,
          data: { items: [], nextCursor: null },
          error: null,
          message: "Members loaded.",
        },
      ],
      pageParams: [null],
    });
    queryClient.setQueryData(invitationOptions.queryKey, {
      pages: [
        {
          ok: true,
          data: { items: [acceptedInvitation], nextCursor: null },
          error: null,
          message: "Invitations loaded.",
        },
      ],
      pageParams: [null],
    });
    queryClient.setQueryData(filteredInvitationOptions.queryKey, {
      pages: [
        {
          ok: true,
          data: { items: [], nextCursor: null },
          error: null,
          message: "Invitations loaded.",
        },
      ],
      pageParams: [null],
    });
    queryClient.setQueryData(localeOptions.queryKey, {
      ok: true,
      data: { items: [locale, hindiLocale] },
      error: null,
      message: "Locales loaded.",
    });

    const { container } = renderWithQueryClient(
      <ProjectAccessSettings
        projectId={project.id}
        environmentId={project.environment.id}
        role="owner"
        localeAccessMode="all"
        effectiveProjectActions={[
          "project.member.read",
          "project.member.invite",
          "project.member.role.update",
          "project.member.locale.update",
          "project.member.remove",
        ]}
      />,
      queryClient,
    );

    const user = userEvent.setup();
    const memberSearch = await screen.findByLabelText("Member name or email prefix");
    const memberRole = screen.getByLabelText("Role", { selector: "select#member-role-filter" });
    const invitationSearch = screen.getByLabelText("Invitation email prefix");
    const invitationStatus = screen.getByLabelText("Status");
    expect(memberSearch.getAttribute("maxlength")).toBe("100");
    expect(invitationSearch.getAttribute("maxlength")).toBe("100");
    expect(Array.from((memberRole as HTMLSelectElement).options)).toHaveLength(8);
    expect(
      Array.from((invitationStatus as HTMLSelectElement).options, ({ value }) => value),
    ).toEqual(["all", "pending", "accepted", "revoked", "expired"]);
    expect(screen.getByText("member@example.test")).toBeTruthy();
    expect(screen.getByText("accepted@example.test")).toBeTruthy();

    await user.selectOptions(memberRole, "reviewer");
    expect(await screen.findByText("No matching project members")).toBeTruthy();
    await user.selectOptions(invitationStatus, "pending");
    expect(await screen.findByText("No invitations match the current filters.")).toBeTruthy();
    expect((await axe.run(container)).violations).toEqual([]);
  });

  it("provides actionable governance recovery messages", () => {
    expect(governanceErrorMessage({ data: { code: "LAST_OWNER_REQUIRED" } })).toMatch(
      /another owner/i,
    );
    expect(governanceErrorMessage({ error: { code: "VERSION_CONFLICT" } })).toMatch(
      /latest version/i,
    );
    expect(governanceErrorMessage({ code: "LOCALE_UNAVAILABLE" })).toMatch(/enabled locales/i);
    expect(governanceErrorMessage({ code: "INVITATION_CONFLICT" })).toMatch(
      /revoke the pending invitation/i,
    );
    expect(governanceErrorMessage(new Error("Network closed."), true)).toMatch(
      /instead of retrying blindly/i,
    );
  });

  it("has accessible invitation creation semantics", async () => {
    renderWithQueryClient(
      <InviteMemberDialog projectId={project.id} projectLocales={[locale, hindiLocale]} />,
    );
    await expectOpenDialogToHaveNoViolations(/invite member/i);
  });

  it("requires a complete invitation role and locale policy", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(
      <InviteMemberDialog projectId={project.id} projectLocales={[locale, hindiLocale]} />,
    );
    await user.click(screen.getByRole("button", { name: /invite member/i }));
    await user.type(screen.getByLabelText("Email"), "invitee@example.test");

    const role = screen.getByLabelText("Role");
    expect(Array.from((role as HTMLSelectElement).options, (option) => option.value)).toEqual([
      "owner",
      "developer",
      "content_admin",
      "editor",
      "reviewer",
      "client_editor",
      "read_only",
    ]);
    const localeAccess = screen.getByLabelText("Locale access");
    const create = screen.getByRole("button", { name: /create invitation/i });
    await user.selectOptions(localeAccess, "selected");
    expect(create.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/select at least one enabled locale/i)).toBeTruthy();

    await user.click(screen.getByRole("checkbox", { name: /Hindi \(hi\)/i }));
    expect(create.hasAttribute("disabled")).toBe(false);

    await user.selectOptions(role, "owner");
    expect((localeAccess as HTMLSelectElement).value).toBe("all");
    expect((localeAccess as HTMLSelectElement).disabled).toBe(true);
    expect(screen.getByText(/owners always receive all-locale access/i)).toBeTruthy();
  });

  it("keeps one-time invitation tokens out of the mutation cache and clears the dialog copy", async () => {
    const token = "t".repeat(43);
    const issued = Schema.decodeUnknownSync(IssuedProjectInvitation)({
      invitation: {
        id: "019fae8b-1234-7000-8000-000000000099",
        projectId: project.id,
        email: "invitee@example.test",
        role: "client_editor",
        localeAccess: { mode: "all" },
        status: "pending",
        version: 1,
        expiresAt: "2026-09-23T00:00:00.000Z",
        acceptedAt: null,
        revokedAt: null,
        createdAt: "2026-09-16T00:00:00.000Z",
        updatedAt: "2026-09-16T00:00:00.000Z",
      },
      token,
    });
    const createInvitation = vi.fn(async () => ({
      ok: true as const,
      data: issued,
      error: null,
      message: "Invitation created.",
    }));
    const queryClient = new QueryClient();
    const user = userEvent.setup();

    renderWithQueryClient(
      <InviteMemberDialog
        projectId={project.id}
        projectLocales={[locale, hindiLocale]}
        createInvitation={createInvitation}
      />,
      queryClient,
    );
    await user.click(screen.getByRole("button", { name: /invite member/i }));
    await user.type(screen.getByLabelText("Email"), "invitee@example.test");
    await user.click(screen.getByRole("button", { name: /create invitation/i }));

    const link = await screen.findByLabelText("One-time invitation link");
    expect((link as HTMLInputElement).value).toContain(token);
    expect(createInvitation).toHaveBeenCalledOnce();
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);

    await user.click(screen.getByRole("checkbox", { name: /I saved the invitation link/i }));
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByLabelText("One-time invitation link")).toBeNull();
    expect(JSON.stringify(queryClient.getMutationCache().getAll())).not.toContain(token);
  });

  it("has accessible credential issuance semantics", async () => {
    renderWithQueryClient(
      <IssueCredentialDialog projectId={project.id} environmentId={project.environment.id} />,
    );
    await expectOpenDialogToHaveNoViolations(/issue credential/i);
  });

  it("warns that legacy non-expiring Preview credentials fail closed", async () => {
    const credential = Schema.decodeUnknownSync(ApiCredential)({
      id: "019fae8b-1234-7000-8000-000000000099",
      workspaceId: project.workspaceId,
      projectId: project.id,
      environmentId: project.environment.id,
      family: "preview",
      name: "Legacy Preview",
      keyPrefix: "ffd_prev_019fae8b-1234-7000-8000-000000000099",
      scopes: ["preview.read"],
      status: "active",
      version: 1,
      activatedAt: "2026-07-29T00:00:00.000Z",
      expiresAt: null,
      retireAt: null,
      revokedAt: null,
      createdAt: "2026-07-29T00:00:00.000Z",
      updatedAt: "2026-07-29T00:00:00.000Z",
    });
    const { container } = renderWithQueryClient(
      <CredentialRow credential={credential} canRotate canRevoke />,
    );
    expect(screen.getByText("Legacy Preview credential blocked")).toBeTruthy();
    expect(screen.getByText(/fails authentication and cannot rotate/i)).toBeTruthy();
    expect((await axe.run(container)).violations).toEqual([]);
  });

  it("has accessible staged credential rotation and pending-state recovery semantics", async () => {
    const baseCredential = Schema.decodeUnknownSync(ApiCredential)({
      id: "019fae8b-1234-7000-8000-000000000091",
      workspaceId: project.workspaceId,
      projectId: project.id,
      environmentId: project.environment.id,
      family: "management",
      name: "Deployment automation",
      keyPrefix: "ffd_mgmt_019fae8b-1234-7000-8000-000000000091",
      scopes: ["content.read"],
      status: "active",
      version: 1,
      activatedAt: "2026-09-16T00:00:00.000Z",
      expiresAt: null,
      retireAt: null,
      revokedAt: null,
      createdAt: "2026-09-16T00:00:00.000Z",
      updatedAt: "2026-09-16T00:00:00.000Z",
    });
    const pendingRotation = Schema.decodeUnknownSync(ApiCredentialRotation)({
      id: "019fae8b-1234-7000-8000-000000000092",
      projectId: project.id,
      environmentId: project.environment.id,
      predecessorCredentialId: baseCredential.id,
      successorCredentialId: "019fae8b-1234-7000-8000-000000000093",
      status: "pending",
      version: 1,
      activatedAt: null,
      retireAt: null,
      completedAt: null,
      canceledAt: null,
      createdAt: "2026-09-16T00:00:00.000Z",
      updatedAt: "2026-09-16T00:00:00.000Z",
    });
    const user = userEvent.setup();
    const pending = renderWithQueryClient(
      <CredentialRow
        credential={{ ...baseCredential, openRotation: pendingRotation }}
        canChangeRotation
        canRevoke
      />,
    );
    await user.click(screen.getByRole("button", { name: "Activate replacement" }));
    expect((await axe.run(await screen.findByRole("alertdialog"))).violations).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Keep current state" }));
    await user.click(screen.getByRole("button", { name: "Cancel rotation" }));
    expect((await axe.run(await screen.findByRole("alertdialog"))).violations).toEqual([]);
    pending.unmount();

    const overlapRotation = Schema.decodeUnknownSync(ApiCredentialRotation)({
      ...pendingRotation,
      status: "overlap",
      version: 2,
      activatedAt: "2026-09-16T01:00:00.000Z",
      retireAt: "2026-09-17T01:00:00.000Z",
      updatedAt: "2026-09-16T01:00:00.000Z",
    });
    renderWithQueryClient(
      <CredentialRow
        credential={{
          ...baseCredential,
          status: "retiring",
          retireAt: overlapRotation.retireAt,
          openRotation: overlapRotation,
        }}
        canChangeRotation
        canRevoke={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Complete rotation" }));
    expect((await axe.run(await screen.findByRole("alertdialog"))).violations).toEqual([]);
  });

  it("has accessible webhook creation and secret-rotation semantics", async () => {
    const create = renderWithQueryClient(
      <CreateWebhookEndpointDialog projectId={project.id} environmentId={project.environment.id} />,
    );
    await expectOpenDialogToHaveNoViolations(/new endpoint/i);
    create.unmount();

    const mapping = renderWithQueryClient(
      <CreateInvalidationMappingDialog
        projectId={project.id}
        environmentId={project.environment.id}
      />,
    );
    await expectOpenDialogToHaveNoViolations(/new mapping/i);
    mapping.unmount();

    renderWithQueryClient(
      <WebhookEndpointActions
        projectId={project.id}
        environmentId={project.environment.id}
        endpoint={webhookEndpoint}
      />,
    );
    await expectOpenDialogToHaveNoViolations(/rotate secret/i);
  });

  it("has accessible locale creation semantics", async () => {
    renderWithQueryClient(<AddLocaleDialog projectId={project.id} />);
    await expectOpenDialogToHaveNoViolations(/add locale/i);
  });

  it("has accessible entry creation and rename semantics", async () => {
    renderWithQueryClient(
      <CreateEntryDialog
        projectId={project.id}
        environmentId={project.environment.id}
        collectionId={collectionDraft.collection.id}
        locale="en"
        schemaRevisionId="019fae8b-1234-7000-8000-000000000020"
        contractHash={"c".repeat(64)}
      />,
    );
    await expectOpenDialogToHaveNoViolations(/new entry/i);
    cleanup();
    renderWithQueryClient(
      <RenameEntryDialog
        projectId={project.id}
        environmentId={project.environment.id}
        collectionId={collectionDraft.collection.id}
        entryId="019fae8b-1234-7000-8000-000000000021"
        locale="en"
        displayName="Homepage"
        nameVersion={1}
      />,
    );
    await expectOpenDialogToHaveNoViolations(/rename entry/i);
  });

  it("has accessible exact-locale publication and unpublish semantics", async () => {
    const publicationId = "019fae8b-1234-7000-8000-000000000041";
    const schemaRevisionId = "019fae8b-1234-7000-8000-000000000042";
    const hash = "d".repeat(64);
    const scope = {
      projectId: project.id,
      environmentId: project.environment.id,
      collectionId: collectionDraft.collection.id,
      entryId: "019fae8b-1234-7000-8000-000000000043",
      locale: "en",
    };
    const size = {
      documentBytes: 512,
      referenceManifestBytes: 2,
      combinedBytes: 514,
      maximumBytes: 1_048_576,
      bucket: "small",
    };
    const summary = Schema.decodeUnknownSync(EntryPublicationSummary)({
      id: publicationId,
      snapshotId: publicationId,
      entryId: scope.entryId,
      localeId: locale.id,
      locale: scope.locale,
      sequence: 1,
      schemaRevisionId,
      contractHash: hash,
      sharedRevisionId: null,
      sharedVersion: 0,
      localizedRevisionId: null,
      localizedVersion: 0,
      contentHash: hash,
      authorityHash: hash,
      documentHash: hash,
      changedFieldIds: [],
      size,
      publishedByUserId: "accessible-user",
      publishedByCredentialId: null,
      publishedAt: "2026-08-09T12:00:00.000Z",
      current: true,
    });
    const status = Schema.decodeUnknownSync(EntryPublicationStatus)({
      entryId: scope.entryId,
      localeId: locale.id,
      locale: scope.locale,
      state: "published",
      stateVersion: 1,
      currentPublication: summary,
      currentSchemaRevisionId: schemaRevisionId,
      currentContractHash: hash,
      currentSharedRevisionId: null,
      currentSharedVersion: 0,
      currentLocalizedRevisionId: null,
      currentLocalizedVersion: 0,
      sharedChanged: false,
      localizedChanged: false,
      schemaChanged: false,
      changedSincePublication: false,
    });
    const plan = Schema.decodeUnknownSync(EntryPublicationPlan)({
      entryId: scope.entryId,
      localeId: locale.id,
      locale: scope.locale,
      stateVersion: 1,
      currentPublicationId: publicationId,
      schemaRevisionId,
      contractHash: hash,
      sharedRevisionId: null,
      sharedVersion: 0,
      localizedRevisionId: null,
      localizedVersion: 0,
      valid: true,
      issues: [],
      capped: false,
      contentHash: hash,
      authorityHash: hash,
      changedFieldIds: [],
      size,
      referencesWouldRefresh: false,
      wouldCreatePublication: false,
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY, retry: false } },
    });
    const statusOptions =
      orpc.platform.projects.collections.entries.publications.status.queryOptions({ input: scope });
    const historyOptions =
      orpc.platform.projects.collections.entries.publications.list.queryOptions({
        input: { ...scope, cursor: null, limit: 5 },
      });
    const planOptions =
      orpc.platform.projects.collections.entries.publications.validate.queryOptions({
        input: scope,
      });
    queryClient.setQueryData(statusOptions.queryKey, {
      ok: true,
      data: status,
      error: null,
      message: "Publication status loaded.",
    });
    queryClient.setQueryData(historyOptions.queryKey, {
      ok: true,
      data: EntryPublicationPage.make({ items: [summary], nextCursor: null }),
      error: null,
      message: "Publication history loaded.",
    });
    queryClient.setQueryData(planOptions.queryKey, {
      ok: true,
      data: plan,
      error: null,
      message: "Publication validation completed.",
    });
    renderWithQueryClient(
      <PublicationCard {...scope} canPublish hasUnsavedChanges={false} />,
      queryClient,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^publish en$/i }));
    const publishDialog = await screen.findByRole("dialog");
    expect((await axe.run(publishDialog)).violations).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: /^unpublish en$/i }));
    const unpublishDialog = await screen.findByRole("alertdialog");
    expect((await axe.run(unpublishDialog)).violations).toEqual([]);
  });

  it("has accessible code-managed structure semantics without mutation controls", async () => {
    const { container } = renderWithQueryClient(
      <CodeManagedStructureCard fields={collectionDraft.fields} revisionId={null} />,
    );
    expect(screen.getByRole("heading", { name: /structure is managed in code/i })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /add field|save schema|publish schema/i }),
    ).toBeNull();
    expect((await axe.run(container)).violations).toEqual([]);
  });

  it("validates locale tags before creating a locale", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<AddLocaleDialog projectId={project.id} />);
    await user.click(screen.getByRole("button", { name: /add locale/i }));
    await user.type(screen.getByLabelText(/locale tag/i), "en_US");
    await user.type(screen.getByLabelText(/display name/i), "English US");
    await user.click(screen.getByRole("button", { name: /add locale/i }));

    expect(await screen.findByText(/use a registered bcp 47 locale tag/i)).toBeTruthy();
  });

  it("has accessible membership locale-access semantics", async () => {
    renderWithQueryClient(
      <LocaleAccessDialog
        projectId={project.id}
        member={member}
        projectLocales={[locale, hindiLocale]}
      />,
    );
    await expectOpenDialogToHaveNoViolations(/locale access/i);
  });

  it("requires confirmation before reducing member locale access", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(
      <LocaleAccessDialog
        projectId={project.id}
        member={member}
        projectLocales={[locale, hindiLocale]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /locale access/i }));
    await user.selectOptions(screen.getByLabelText(/access mode/i), "none");

    const save = screen.getByRole("button", { name: /save locale access/i });
    expect(save.hasAttribute("disabled")).toBe(true);
    await user.click(screen.getByRole("checkbox", { name: /immediately reduces/i }));
    expect(save.hasAttribute("disabled")).toBe(false);
  });

  it("supports keyboard locale-tab navigation", async () => {
    const user = userEvent.setup();
    const onSelectedLocaleChange = vi.fn();
    renderWithQueryClient(
      <LocaleTabs
        locales={[locale, hindiLocale]}
        selectedLocaleId={locale.id}
        onSelectedLocaleChange={onSelectedLocaleChange}
        hasUnsavedChanges={false}
        renderContent={(item) => <p>Editing {item.displayName}</p>}
      />,
    );

    screen.getByRole("tab", { name: /english/i }).focus();
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: /hindi/i }));
  });

  it("confirms locale switches when a form has unsaved changes", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(
      <LocaleTabs
        locales={[locale, hindiLocale]}
        selectedLocaleId={locale.id}
        onSelectedLocaleChange={() => undefined}
        hasUnsavedChanges
        renderContent={(item) => <p>Editing {item.displayName}</p>}
      />,
    );

    await user.click(screen.getByRole("tab", { name: /hindi/i }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toMatch(/unsaved changes in english may be lost/i);
    expect((await axe.run(dialog)).violations).toEqual([]);
    await user.click(screen.getByRole("button", { name: /keep editing/i }));
    expect(screen.getByRole("tab", { name: /english/i }).getAttribute("aria-selected")).toBe(
      "true",
    );
  });
});
