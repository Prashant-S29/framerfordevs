// @vitest-environment jsdom

import { configure, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";

configure({ asyncUtilTimeout: 5_000 });

const challenge = "s".repeat(43);
const entryId = "019fae8b-1234-7000-8000-000000000001";
const otherEntryId = "019fae8b-1234-7000-8000-000000000002";
const fieldId = "019fae8b-1234-7000-8000-000000000003";
const revisionId = "019fae8b-1234-7000-8000-000000000006";
const digest = "a".repeat(64);
const timestamp = "2026-08-24T00:00:00.000Z";

const summary = (id: string, displayName: string) => ({
  id,
  displayName,
  nameVersion: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
});
const project = {
  collections: [
    {
      sourceKey: "posts",
      apiKey: "posts",
      fields: [
        {
          sourceKey: "title",
          apiKey: "title",
          kind: "short_text",
          required: true,
          localization: "localized",
          configuration: {},
        },
      ],
    },
  ],
};
const generatedForm = {
  source: "published",
  collectionId: fieldId,
  revisionId: fieldId,
  formatVersion: 2,
  validationProfile: "ffd-fields@1",
  currencyRegistryProfile: null,
  contractHash: digest,
  role: "developer",
  canEdit: true,
  fields: [
    {
      id: fieldId,
      parentFieldId: null,
      nodeRole: "root",
      apiKey: "title",
      displayLabel: "Title",
      kind: "short_text",
      required: true,
      localization: "localized",
      deprecated: false,
      position: 0,
      editor: {
        helpText: "A localized title",
        placeholder: "Title",
        visibleToRoles: ["developer"],
        editableByRoles: ["developer"],
      },
      configuration: {},
      children: [],
    },
  ],
  editableFieldIds: [fieldId],
  editorLayout: {
    version: 1,
    tabs: [
      {
        id: fieldId,
        title: "Content",
        description: null,
        position: 0,
        visibleToRoles: ["developer"],
        groups: [
          {
            id: fieldId,
            title: "Main",
            description: null,
            position: 0,
            columns: 1,
            visibleToRoles: ["developer"],
            fields: [
              {
                id: fieldId,
                fieldId,
                position: 0,
                helpTextOverride: null,
                visibleToRoles: ["developer"],
              },
            ],
          },
        ],
      },
    ],
    sidebarGroups: [],
  },
  currencyMinorUnits: {},
};

function response(status: number, value: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => `${JSON.stringify(value)}\n`,
  };
}

function success(data: unknown) {
  return response(200, { ok: true, data });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.body.replaceChildren();
});

describe("bundled local editor application", () => {
  it("keeps tokens absent, edits exact-locale content, preserves conflicts, publishes exactly, guards navigation, reloads, and passes axe", async () => {
    document.body.innerHTML = '<div id="editor-root">Starting local editor…</div>';
    window.history.replaceState(null, "", `/#session=${challenge}`);
    const requests: Array<{ readonly url: string; readonly init?: RequestInit }> = [];
    let draftTitle = "Initial title";
    let localizedVersion = 1;
    let saveConflicts = true;
    let schemaMatchesHosted = true;
    let schemaGeneration = 1;
    let localProject = project;
    let publicationState: "published" | "unpublished" = "unpublished";
    let publicationStateVersion = 0;
    const publication = {
      id: revisionId,
      entryId,
      locale: "en-US",
      sequence: 1,
      schemaRevisionId: fieldId,
      contractHash: digest,
      sharedRevisionId: null,
      sharedVersion: 0,
      localizedRevisionId: fieldId,
      localizedVersion: 2,
      contentHash: "b".repeat(64),
      authorityHash: "c".repeat(64),
      documentHash: "d".repeat(64),
      size: {
        documentBytes: 100,
        referenceManifestBytes: 10,
        combinedBytes: 110,
        maximumBytes: 1_048_576,
        bucket: "small",
      },
      publishedAt: timestamp,
      current: true,
    };
    vi.spyOn(window, "confirm").mockReturnValue(false);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requests.push({ url, ...(init === undefined ? {} : { init }) });
        if (url === "/api/session") return response(200, { ok: true });
        if (url === "/api/status") {
          return response(200, {
            projectId: "019fae8b-1234-7000-8000-000000000004",
            environment: "main",
            schemaMatchesHosted,
            schemaValid: true,
            schemaGeneration,
            schemaDiagnosticCode: null,
            localCollectionCount: 1,
            locales: ["en", "hi"],
            collections: [{ sourceKey: "posts", apiKey: "posts" }],
          });
        }
        if (url !== "/api/operation" || typeof init?.body !== "string")
          return response(404, { ok: false, code: "EDITOR_ROUTE_NOT_FOUND" });
        const operation = JSON.parse(init.body);
        switch (operation.operation) {
          case "schema.local":
            return success({ localProject, hostedProject: project });
          case "form.get":
            return success(generatedForm);
          case "entries.list":
            return success({
              items: [summary(entryId, "Post"), summary(otherEntryId, "Another post")],
              nextCursor: null,
            });
          case "entry.get":
            return success({
              entry: summary(
                operation.entryId,
                operation.entryId === entryId ? "Post" : "Another post",
              ),
              locale: "en-US",
              schemaRevisionId: fieldId,
              contractHash: digest,
              sharedVersion: 0,
              sharedRevisionId: null,
              sharedValues: {},
              localizedVersion,
              localizedRevisionId: fieldId,
              localizedValues: { title: draftTitle },
              canEditShared: true,
              validation: { valid: true, issues: [], capped: false },
            });
          case "publication.status":
            return success({
              entryId: operation.entryId,
              locale: "en-US",
              state: publicationState,
              stateVersion: publicationStateVersion,
              currentPublication: publicationState === "published" ? publication : null,
              currentSchemaRevisionId: fieldId,
              currentContractHash: digest,
              currentSharedRevisionId: null,
              currentSharedVersion: 0,
              currentLocalizedRevisionId: fieldId,
              currentLocalizedVersion: 1,
              sharedChanged: false,
              localizedChanged: true,
              schemaChanged: false,
              changedSincePublication: publicationState !== "published",
            });
          case "publication.validate":
            return success({
              entryId,
              locale: "en-US",
              stateVersion: publicationStateVersion,
              currentPublicationId: publicationState === "published" ? publication.id : null,
              schemaRevisionId: fieldId,
              contractHash: digest,
              sharedRevisionId: null,
              sharedVersion: 0,
              localizedRevisionId: fieldId,
              localizedVersion,
              valid: true,
              issues: [],
              capped: false,
              contentHash: "b".repeat(64),
              authorityHash: "c".repeat(64),
              size: publication.size,
              referencesWouldRefresh: false,
              wouldCreatePublication: publicationState !== "published",
            });
          case "publication.publish":
            publicationState = "published";
            publicationStateVersion += 1;
            return success({
              entryId,
              locale: "en-US",
              commandId: fieldId,
              stateVersion: publicationStateVersion,
              resultKind: "changed",
              publication,
            });
          case "publication.unpublish":
            publicationState = "unpublished";
            publicationStateVersion += 1;
            return success({
              entryId,
              locale: "en-US",
              commandId: fieldId,
              stateVersion: publicationStateVersion,
              resultKind: "changed",
              unpublishedPublicationId: publication.id,
              unpublishedPublicationSequence: publication.sequence,
              unpublishedAt: timestamp,
            });
          case "entry.save":
            if (saveConflicts)
              return response(409, { ok: false, error: { code: "DRAFT_CONFLICT" } });
            draftTitle = "Saved title";
            return success({
              entryId,
              commandId: fieldId,
              sharedChanged: false,
              sharedVersion: 0,
              sharedRevisionId: null,
              localizedChanged: true,
              localizedVersion: 2,
              localizedRevisionId: fieldId,
              validation: { valid: true, issues: [], capped: false },
            });
          default:
            return response(404, { ok: false, code: "EDITOR_ROUTE_NOT_FOUND" });
        }
      }),
    );

    await import("./index");
    const user = userEvent.setup();

    expect(await screen.findByRole("heading", { name: "Framer for Devs editor" })).toBeTruthy();
    await waitFor(() => expect(Reflect.get(screen.getByLabelText("Locale"), "value")).toBe("en"));
    await user.click(await screen.findByRole("button", { name: "Post" }));
    const title = await screen.findByPlaceholderText("Title");
    expect(Reflect.get(title, "value")).toBe("Initial title");
    await user.clear(title);
    await user.type(title, "Local edit");
    expect(screen.getByText("Unsaved changes")).toBeTruthy();

    const saveButton = screen.getAllByRole("button", { name: "Save draft" }).at(-1);
    if (saveButton === undefined) throw new Error("Save button is missing.");
    await user.click(saveButton);
    expect(await screen.findByText(/draft changed elsewhere/u)).toBeTruthy();
    expect(Reflect.get(title, "value")).toBe("Local edit");

    schemaMatchesHosted = false;
    schemaGeneration = 2;
    localProject = {
      collections: [
        {
          sourceKey: "posts",
          apiKey: "posts",
          fields: [
            ...(project.collections[0]?.fields ?? []),
            {
              sourceKey: "summary",
              apiKey: "summary",
              kind: "long_text",
              required: false,
              localization: "localized",
              configuration: {},
            },
          ],
        },
      ],
    };
    expect(await screen.findByText(/Local structure differs from hosted structure/u)).toBeTruthy();
    await user.click(await screen.findByRole("tab", { name: "Local structure" }));
    expect(await screen.findByText("summary")).toBeTruthy();
    expect(Reflect.get(saveButton, "disabled")).toBe(true);
    expect(Reflect.get(title, "value")).toBe("Local edit");
    schemaMatchesHosted = true;
    await waitFor(() => expect(Reflect.get(saveButton, "disabled")).toBe(false));

    await user.click(screen.getByRole("button", { name: "Another post" }));
    expect(window.confirm).toHaveBeenCalledWith("Discard unsaved entry changes?");
    expect(screen.getByRole("heading", { name: "Post" })).toBeTruthy();
    expect(Reflect.get(title, "value")).toBe("Local edit");

    vi.mocked(window.confirm).mockReturnValue(true);
    draftTitle = "Remote title";
    localizedVersion = 2;
    saveConflicts = false;
    await user.click(screen.getByRole("button", { name: "Reload current" }));
    await waitFor(() =>
      expect(Reflect.get(screen.getByPlaceholderText("Title"), "value")).toBe("Remote title"),
    );
    expect(screen.getByText("Current draft reloaded.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Validate and publish en" }));
    expect(await screen.findByText("Locale published.")).toBeTruthy();
    const unpublish = screen.getByRole("button", { name: "Unpublish en" });
    await waitFor(() => expect(Reflect.get(unpublish, "disabled")).toBe(false));
    await user.click(unpublish);
    expect(await screen.findByText("Locale unpublished.")).toBeTruthy();

    expect(window.location.hash).toBe("");
    expect(document.body.textContent).not.toContain(challenge);
    expect(JSON.stringify(window.localStorage)).not.toContain(challenge);
    expect(requests[0]?.init?.body).toBe("{}");
    expect(Reflect.get(requests[0]?.init?.headers ?? {}, "X-FFD-Editor-Session")).toBe(challenge);
    expect(requests.every((request) => !request.url.includes(challenge))).toBe(true);
    expect(
      requests
        .filter((request) => request.url === "/api/operation")
        .every((request) => !String(request.init?.body).includes("hosted-secret-token")),
    ).toBe(true);
    const saveRequest = requests.find((request) =>
      String(request.init?.body).includes('"operation":"entry.save"'),
    );
    expect(JSON.parse(String(saveRequest?.init?.body))).toMatchObject({
      operation: "entry.save",
      collectionKey: "posts",
      locale: "en",
      entryId,
      expectedSharedVersion: 0,
      expectedLocalizedVersion: 1,
      mutations: [
        {
          operation: "set",
          scope: "localized",
          path: ["title"],
          value: "Local edit",
        },
      ],
    });

    const canvas = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(() => null);
    const result = await axe.run(document.body);
    canvas.mockRestore();
    expect(result.violations).toEqual([]);
  }, 30_000);
});
