/** @vitest-environment jsdom */

import { EntryRevisionPage, EntryRevisionSummary } from "@framerfordevs/api/contracts/entry/index";
import { ProjectLocale, ProjectLocaleList } from "@framerfordevs/api/contracts/locale/index";
import { PreviewItem } from "@framerfordevs/api/contracts/preview/index";
import { Project } from "@framerfordevs/api/contracts/platform/index";
import {
  EntryPublicationStatus,
  EntryPublicationSummary,
} from "@framerfordevs/api/contracts/publication/index";
import { CmsCollection } from "@framerfordevs/api/contracts/schema/index";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { Schema } from "effect";
import { type ComponentProps, forwardRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PersistedDraftPreviewLink } from "../editor";
import { EntryPreview, isValidRevisionPreviewSearch } from "./index";
import { orpc } from "@/utils/orpc";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const original = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...original,
    Link: forwardRef<
      HTMLAnchorElement,
      ComponentProps<"a"> & {
        readonly to?: unknown;
        readonly params?: unknown;
        readonly search?: unknown;
      }
    >(function TestLink({ children, to: _to, params: _params, search: _search, ...props }, ref) {
      return (
        <a {...props} ref={ref} href="#preview-test-link">
          {children}
        </a>
      );
    }),
  };
});

const ids = {
  workspace: "019fae8b-1234-7000-8000-000000000001",
  project: "019fae8b-1234-7000-8000-000000000002",
  environment: "019fae8b-1234-7000-8000-000000000003",
  locale: "019fae8b-1234-7000-8000-000000000004",
  collection: "019fae8b-1234-7000-8000-000000000005",
  entry: "019fae8b-1234-7000-8000-000000000006",
  schema: "019fae8b-1234-7000-8000-000000000007",
  shared: "019fae8b-1234-7000-8000-000000000008",
  localized: "019fae8b-1234-7000-8000-000000000009",
  publication: "019fae8b-1234-7000-8000-000000000010",
  snapshot: "019fae8b-1234-7000-8000-000000000011",
};
const timestamp = "2026-08-12T12:00:00.000Z";
const project = Schema.decodeUnknownSync(Project)({
  id: ids.project,
  workspaceId: ids.workspace,
  name: "Preview project",
  key: "preview-project",
  description: null,
  version: 1,
  archivedAt: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  environment: {
    id: ids.environment,
    workspaceId: ids.workspace,
    projectId: ids.project,
    key: "main",
    name: "main",
    isPrimary: true,
    createdAt: timestamp,
  },
  capabilities: [],
});
const locale = Schema.decodeUnknownSync(ProjectLocale)({
  id: ids.locale,
  workspaceId: ids.workspace,
  projectId: ids.project,
  tag: "gu",
  displayName: "Gujarati",
  status: "enabled",
  position: 0,
  version: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
});
const collection = Schema.decodeUnknownSync(CmsCollection)({
  id: ids.collection,
  workspaceId: ids.workspace,
  projectId: ids.project,
  environmentId: ids.environment,
  apiKey: "articles",
  displayName: "Articles",
  description: null,
  version: 1,
  draftVersion: 2,
  draftBaseRevisionId: ids.schema,
  currentPublishedRevisionId: ids.schema,
  currentPublishedSequence: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
});
const sharedRevision = Schema.decodeUnknownSync(EntryRevisionSummary)({
  id: ids.shared,
  entryId: ids.entry,
  localeId: null,
  scope: "shared",
  sequence: 1,
  previousRevisionId: null,
  schemaRevisionId: ids.schema,
  contractHash: "a".repeat(64),
  changedFieldIds: [],
  restoredFromRevisionId: null,
  authoredByUserId: "preview-author",
  authoredByCredentialId: null,
  authoredAt: timestamp,
});
const localizedRevision = Schema.decodeUnknownSync(EntryRevisionSummary)({
  ...sharedRevision,
  id: ids.localized,
  localeId: ids.locale,
  scope: "localized",
});
const preview = Schema.decodeUnknownSync(PreviewItem)({
  id: ids.entry,
  collectionId: ids.collection,
  collection: "articles",
  locale: "gu",
  preview: {
    version: 1,
    source: "current",
    schemaRevisionId: ids.schema,
    contractHash: "a".repeat(64),
    sharedRevisionId: ids.shared,
    sharedVersion: 1,
    localizedRevisionId: ids.localized,
    localizedVersion: 1,
  },
  data: { title: "ગુજરાતી પૂર્વાવલોકન", body: [{ _type: "block", children: [] }] },
  validation: {
    valid: false,
    issues: [
      {
        fieldId: ids.localized,
        path: "title",
        code: "min_length",
        message: "Enter at least 30 characters.",
      },
    ],
    capped: false,
  },
});
const publicationSummary = Schema.decodeUnknownSync(EntryPublicationSummary)({
  id: ids.publication,
  snapshotId: ids.snapshot,
  entryId: ids.entry,
  localeId: ids.locale,
  locale: "gu",
  sequence: 3,
  schemaRevisionId: ids.schema,
  contractHash: "a".repeat(64),
  sharedRevisionId: ids.shared,
  sharedVersion: 1,
  localizedRevisionId: ids.localized,
  localizedVersion: 1,
  contentHash: "b".repeat(64),
  authorityHash: "c".repeat(64),
  documentHash: "d".repeat(64),
  changedFieldIds: [],
  size: {
    documentBytes: 100,
    referenceManifestBytes: 2,
    combinedBytes: 102,
    maximumBytes: 4_194_304,
    bucket: "small",
  },
  publishedByUserId: "preview-author",
  publishedByCredentialId: null,
  publishedAt: timestamp,
  current: true,
});
const publication = Schema.decodeUnknownSync(EntryPublicationStatus)({
  entryId: ids.entry,
  localeId: ids.locale,
  locale: "gu",
  state: "unpublished",
  stateVersion: 0,
  currentPublication: null,
  currentSchemaRevisionId: ids.schema,
  currentContractHash: "a".repeat(64),
  currentSharedRevisionId: ids.shared,
  currentSharedVersion: 1,
  currentLocalizedRevisionId: ids.localized,
  currentLocalizedVersion: 1,
  sharedChanged: true,
  localizedChanged: true,
  schemaChanged: false,
  changedSincePublication: true,
});

function response<A>(data: A, message: string) {
  return { ok: true as const, data, error: null, message };
}

function makeQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: Number.POSITIVE_INFINITY, retry: false, refetchOnMount: false },
    },
  });
  const scope = {
    projectId: ids.project,
    environmentId: ids.environment,
    collectionId: ids.collection,
    entryId: ids.entry,
    locale: "gu",
  };
  queryClient.setQueryData(
    orpc.platform.projects.get.queryOptions({ input: { projectId: ids.project } }).queryKey,
    response(project, "Project loaded."),
  );
  queryClient.setQueryData(
    orpc.platform.projects.locales.list.queryOptions({
      input: { projectId: ids.project, view: "enabled", includeRemoved: false },
    }).queryKey,
    response(ProjectLocaleList.make({ items: [locale] }), "Locales loaded."),
  );
  queryClient.setQueryData(
    orpc.platform.projects.collections.get.queryOptions({
      input: {
        projectId: ids.project,
        environmentId: ids.environment,
        collectionId: ids.collection,
      },
    }).queryKey,
    response(collection, "Collection loaded."),
  );
  queryClient.setQueryData(
    orpc.platform.projects.collections.entries.listRevisions.queryOptions({
      input: { ...scope, scope: "shared", cursor: null, limit: 25 },
    }).queryKey,
    response(EntryRevisionPage.make({ items: [sharedRevision], nextCursor: null }), "Loaded."),
  );
  queryClient.setQueryData(
    orpc.platform.projects.collections.entries.listRevisions.queryOptions({
      input: { ...scope, scope: "localized", cursor: null, limit: 25 },
    }).queryKey,
    response(EntryRevisionPage.make({ items: [localizedRevision], nextCursor: null }), "Loaded."),
  );
  queryClient.setQueryData(
    orpc.platform.projects.collections.entries.publications.status.queryOptions({ input: scope })
      .queryKey,
    response(publication, "Publication status loaded."),
  );
  queryClient.setQueryData(
    orpc.platform.projects.collections.entries.preview.current.queryOptions({ input: scope })
      .queryKey,
    response(preview, "Preview entry loaded."),
  );
  return queryClient;
}

function setCurrentPreviewState(
  queryClient: QueryClient,
  state: "pending" | { readonly errorCode: string },
) {
  const queryKey = orpc.platform.projects.collections.entries.preview.current.queryOptions({
    input: {
      projectId: ids.project,
      environmentId: ids.environment,
      collectionId: ids.collection,
      entryId: ids.entry,
      locale: "gu",
    },
  }).queryKey;
  const query = queryClient.getQueryCache().find({ queryKey, exact: true });
  if (!query) throw new Error("The Preview query fixture must exist.");
  query.setState({
    ...query.state,
    data: undefined,
    error:
      state === "pending"
        ? null
        : Object.assign(new Error("Preview rejected."), { code: state.errorCode }),
    status: state === "pending" ? "pending" : "error",
    fetchStatus: state === "pending" ? "fetching" : "idle",
  });
}

afterEach(cleanup);

describe("Entry Preview", () => {
  it("renders accessible exact-locale draft, validation, production separation, and secret-free endpoint", async () => {
    const onSearchChange = vi.fn();
    const { container } = render(
      <QueryClientProvider client={makeQueryClient()}>
        <EntryPreview
          projectId={ids.project}
          collectionId={ids.collection}
          entryId={ids.entry}
          search={{ locale: "gu", source: "current" }}
          onSearchChange={onSearchChange}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("heading", { name: "Entry preview" })).toBeTruthy();
    expect(screen.getByText("Needs attention")).toBeTruthy();
    expect(screen.getByText(/unavailable in current Delivery/i)).toBeTruthy();
    expect(screen.getByText(/ગુજરાતી પૂર્વાવલોકન/)).toBeTruthy();
    const endpoint = screen.getByText(/\/api\/preview\/v1\/projects\//i).textContent ?? "";
    expect(endpoint).toContain("locale=gu");
    expect(endpoint).not.toContain("ffd_prev_");
    expect(endpoint).not.toContain("token=");
    expect((await axe.run(container)).violations).toEqual([]);

    const clipboard = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: clipboard },
    });
    await user.click(screen.getByRole("button", { name: "Copy endpoint" }));
    expect(clipboard).toHaveBeenCalledWith(endpoint);
    await user.selectOptions(screen.getByLabelText("Source"), "revision");
    expect(onSearchChange).toHaveBeenCalledWith({
      locale: "gu",
      source: "revision",
      schemaRevisionId: ids.schema,
      sharedRevision: "none",
      localizedRevision: "none",
    });
  });

  it("renders explicit revision authority and separately published production status", async () => {
    const queryClient = makeQueryClient();
    const scope = {
      projectId: ids.project,
      environmentId: ids.environment,
      collectionId: ids.collection,
      entryId: ids.entry,
      locale: "gu",
    };
    const revisionPreview = Schema.decodeUnknownSync(PreviewItem)({
      ...preview,
      preview: { ...preview.preview, source: "revision" },
    });
    queryClient.setQueryData(
      orpc.platform.projects.collections.entries.preview.revision.queryOptions({
        input: {
          ...scope,
          schemaRevisionId: ids.schema,
          sharedRevisionId: ids.shared,
          localizedRevisionId: ids.localized,
        },
      }).queryKey,
      response(revisionPreview, "Preview entry loaded."),
    );
    queryClient.setQueryData(
      orpc.platform.projects.collections.entries.publications.status.queryOptions({ input: scope })
        .queryKey,
      response(
        Schema.decodeUnknownSync(EntryPublicationStatus)({
          ...publication,
          state: "published",
          stateVersion: 3,
          currentPublication: publicationSummary,
          changedSincePublication: false,
          sharedChanged: false,
          localizedChanged: false,
        }),
        "Publication status loaded.",
      ),
    );
    const onSearchChange = vi.fn();
    render(
      <QueryClientProvider client={queryClient}>
        <EntryPreview
          projectId={ids.project}
          collectionId={ids.collection}
          entryId={ids.entry}
          search={{
            locale: "gu",
            source: "revision",
            schemaRevisionId: ids.schema,
            sharedRevision: ids.shared,
            localizedRevision: ids.localized,
          }}
          onSearchChange={onSearchChange}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByText("Revision sources")).toBeTruthy();
    expect(screen.getByText(/Published as sequence 3/)).toBeTruthy();
    const endpoint = screen.getByText(/sharedRevision=/).textContent ?? "";
    expect(endpoint).toContain(ids.schema);
    expect(endpoint).toContain(`sharedRevision=${ids.shared}`);
    expect(endpoint).toContain(`localizedRevision=${ids.localized}`);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Shared source"), "none");
    expect(onSearchChange).toHaveBeenCalledWith({
      locale: "gu",
      source: "revision",
      schemaRevisionId: ids.schema,
      sharedRevision: "none",
      localizedRevision: ids.localized,
    });
    await user.selectOptions(screen.getByLabelText("Localized source"), "none");
    expect(onSearchChange).toHaveBeenCalledWith({
      locale: "gu",
      source: "revision",
      schemaRevisionId: ids.schema,
      sharedRevision: ids.shared,
      localizedRevision: "none",
    });
  });

  it("renders bounded loading, locale-denial, and typed recovery states", async () => {
    const pendingClient = makeQueryClient();
    setCurrentPreviewState(pendingClient, "pending");
    const pending = render(
      <QueryClientProvider client={pendingClient}>
        <EntryPreview
          projectId={ids.project}
          collectionId={ids.collection}
          entryId={ids.entry}
          search={{ locale: "gu", source: "current" }}
          onSearchChange={() => undefined}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByText("Loading Preview…")).toBeTruthy();
    pending.unmount();

    const unavailable = render(
      <QueryClientProvider client={makeQueryClient()}>
        <EntryPreview
          projectId={ids.project}
          collectionId={ids.collection}
          entryId={ids.entry}
          search={{ locale: "fr", source: "current" }}
          onSearchChange={() => undefined}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByText("Exact locale unavailable")).toBeTruthy();
    unavailable.unmount();

    const errors = [
      ["PREVIEW_REVISION_INCOMPATIBLE", /do not share this schema contract/i],
      ["PREVIEW_RESPONSE_TOO_LARGE", /exceeds 2.5 MiB/i],
      ["FORBIDDEN", /does not allow this Preview/i],
      ["INTERNAL_ERROR", /retry the request/i],
    ] as const;
    for (const [code, message] of errors) {
      const queryClient = makeQueryClient();
      const rendered = render(
        <QueryClientProvider client={queryClient}>
          <EntryPreview
            projectId={ids.project}
            collectionId={ids.collection}
            entryId={ids.entry}
            search={{ locale: "gu", source: "current" }}
            onSearchChange={() => undefined}
          />
        </QueryClientProvider>,
      );
      setCurrentPreviewState(queryClient, { errorCode: code });
      expect(await screen.findByText(message)).toBeTruthy();
      const retry = screen.getByRole("button", { name: "Try again" });
      expect(retry).toBeTruthy();
      if (code === "INTERNAL_ERROR") await userEvent.setup().click(retry);
      rendered.unmount();
    }
  });

  it("renders valid and capped validation status without hiding Preview data", () => {
    const queryClient = makeQueryClient();
    const validPreview = Schema.decodeUnknownSync(PreviewItem)({
      ...preview,
      validation: { valid: true, issues: [], capped: false },
    });
    const queryKey = orpc.platform.projects.collections.entries.preview.current.queryOptions({
      input: {
        projectId: ids.project,
        environmentId: ids.environment,
        collectionId: ids.collection,
        entryId: ids.entry,
        locale: "gu",
      },
    }).queryKey;
    queryClient.setQueryData(queryKey, response(validPreview, "Preview entry loaded."));
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <EntryPreview
          projectId={ids.project}
          collectionId={ids.collection}
          entryId={ids.entry}
          search={{ locale: "gu", source: "current" }}
          onSearchChange={() => undefined}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByText("Valid")).toBeTruthy();
    expect(screen.getByText("No validation issues were reported.")).toBeTruthy();

    const cappedPreview = Schema.decodeUnknownSync(PreviewItem)({
      ...preview,
      validation: { ...preview.validation, capped: true },
    });
    queryClient.setQueryData(queryKey, response(cappedPreview, "Preview entry loaded."));
    rerender(
      <QueryClientProvider client={queryClient}>
        <EntryPreview
          projectId={ids.project}
          collectionId={ids.collection}
          entryId={ids.entry}
          search={{ locale: "gu", source: "current" }}
          onSearchChange={() => undefined}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByText(/reached the 50-issue limit/i)).toBeTruthy();

    const emptyPreview = Schema.decodeUnknownSync(PreviewItem)({ ...validPreview, data: {} });
    queryClient.setQueryData(queryKey, response(emptyPreview, "Preview entry loaded."));
    rerender(
      <QueryClientProvider client={queryClient}>
        <EntryPreview
          projectId={ids.project}
          collectionId={ids.collection}
          entryId={ids.entry}
          search={{ locale: "gu", source: "current" }}
          onSearchChange={() => undefined}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByText(/projects no visible fields/i)).toBeTruthy();
  });

  it("requires the editor draft to be saved before Preview navigation", () => {
    const { rerender } = render(
      <PersistedDraftPreviewLink
        projectId={ids.project}
        collectionId={ids.collection}
        entryId={ids.entry}
        locale="gu"
        hasUnsavedChanges
      />,
    );
    expect(
      screen.getByRole("button", { name: "Preview persisted draft" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.getByText(/save the draft first/i)).toBeTruthy();

    rerender(
      <PersistedDraftPreviewLink
        projectId={ids.project}
        collectionId={ids.collection}
        entryId={ids.entry}
        locale="gu"
        hasUnsavedChanges={false}
      />,
    );
    expect(screen.getByRole("link", { name: "Preview persisted draft" })).toBeTruthy();
    expect(screen.getByText(/without changing production/i)).toBeTruthy();
  });

  it("renders malformed historical state explicitly without enabling a Preview fetch", async () => {
    const queryClient = makeQueryClient();
    const onSearchChange = vi.fn();
    render(
      <QueryClientProvider client={queryClient}>
        <EntryPreview
          projectId={ids.project}
          collectionId={ids.collection}
          entryId={ids.entry}
          search={{ locale: "gu", source: "revision", sharedRevision: "none" }}
          onSearchChange={onSearchChange}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText("Historical selection is incomplete or invalid")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Preview current draft" })).toBeTruthy();
    expect(
      isValidRevisionPreviewSearch({
        locale: "gu",
        source: "revision",
        sharedRevision: "none",
      }),
    ).toBe(false);
    expect(queryClient.isFetching()).toBe(0);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Preview current draft" }));
    expect(onSearchChange).toHaveBeenCalledWith({ locale: "gu", source: "current" });
  });
});
