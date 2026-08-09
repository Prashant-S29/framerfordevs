/** @vitest-environment jsdom */

import { ProjectMember } from "@framerfordevs/api/contracts/access";
import { ProjectLocale } from "@framerfordevs/api/contracts/locales";
import { Project } from "@framerfordevs/api/contracts/platform";
import { CollectionDraftSchema, SchemaChange } from "@framerfordevs/api/contracts/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { Schema } from "effect";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ArchiveProjectDialog } from "./archive-project-dialog";
import { CreateProjectDialog } from "./create-project-dialog";
import { CreateWorkspaceDialog } from "./create-workspace-dialog";
import { EditProjectDialog } from "./edit-project-dialog";
import { LocaleTabs } from "./locale-tabs";
import {
  InviteMemberDialog,
  IssueCredentialDialog,
  LocaleAccessDialog,
} from "./project-access-settings";
import { AddLocaleDialog } from "./project-locale-settings";
import { CreateEntryDialog } from "./collection-entries";
import { RenameEntryDialog } from "./entry-editor";
import { CreateCollectionDialog } from "./project-collections";
import { PublishCard } from "./schema-builder";
import { SchemaWorkbench } from "./schema-workbench";

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

const riskySchemaChange = Schema.decodeUnknownSync(SchemaChange)({
  changeId: "a".repeat(64),
  code: "field.added.required",
  classification: "potentially_breaking",
  fieldId: "019fae8b-1234-7000-8000-000000000011",
  summary: "A required field was added.",
});

function renderWithQueryClient(component: ReactNode) {
  return render(<QueryClientProvider client={new QueryClient()}>{component}</QueryClientProvider>);
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

  it("has accessible invitation creation semantics", async () => {
    renderWithQueryClient(<InviteMemberDialog projectId={project.id} />);
    await expectOpenDialogToHaveNoViolations(/invite member/i);
  });

  it("has accessible credential issuance semantics", async () => {
    renderWithQueryClient(
      <IssueCredentialDialog projectId={project.id} environmentId={project.environment.id} />,
    );
    await expectOpenDialogToHaveNoViolations(/issue credential/i);
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

  it("has accessible collection and schema-building semantics", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(
      <CreateCollectionDialog projectId={project.id} environmentId={project.environment.id} />,
    );
    await expectOpenDialogToHaveNoViolations(/new collection/i);
    cleanup();
    const { container } = renderWithQueryClient(
      <SchemaWorkbench
        scope={{
          projectId: project.id,
          environmentId: project.environment.id,
          collectionId: collectionDraft.collection.id,
        }}
        draft={collectionDraft}
        collections={[
          {
            id: collectionDraft.collection.id,
            displayName: collectionDraft.collection.displayName,
          },
        ]}
        canWrite
        onSaved={async () => undefined}
        onDirtyChange={() => undefined}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Add Field" }));
    expect((await axe.run(container)).violations).toEqual([]);
  });

  it("requires every risky schema change acknowledgement before publication", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(
      <PublishCard
        scope={{
          projectId: project.id,
          environmentId: project.environment.id,
          collectionId: collectionDraft.collection.id,
        }}
        draft={collectionDraft}
        changes={[riskySchemaChange]}
        valid
        issues={[]}
        canPublish
        onPublished={async () => undefined}
      />,
    );
    const publish = screen.getByRole("button", { name: /publish schema/i });
    expect(publish.hasAttribute("disabled")).toBe(true);
    await user.click(screen.getByRole("checkbox", { name: /required field was added/i }));
    expect(publish.hasAttribute("disabled")).toBe(false);
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
      <LocaleAccessDialog member={member} projectLocales={[locale, hindiLocale]} />,
    );
    await expectOpenDialogToHaveNoViolations(/locale access/i);
  });

  it("requires confirmation before reducing member locale access", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(
      <LocaleAccessDialog member={member} projectLocales={[locale, hindiLocale]} />,
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
