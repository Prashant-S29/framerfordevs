/** @vitest-environment jsdom */

import { CollectionDraftSchema } from "@framerfordevs/api/contracts/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Schema } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SchemaWorkbench } from "./schema-workbench";

const draft = Schema.decodeUnknownSync(CollectionDraftSchema)({
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
    workspaceId: "019fae8b-1234-7000-8000-000000000001",
    projectId: "019fae8b-1234-7000-8000-000000000002",
    environmentId: "019fae8b-1234-7000-8000-000000000003",
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

function renderWorkbench() {
  const onDirtyChange = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SchemaWorkbench
        scope={{
          projectId: draft.collection.projectId,
          environmentId: draft.collection.environmentId,
          collectionId: draft.collection.id,
        }}
        draft={draft}
        collections={[{ id: draft.collection.id, displayName: draft.collection.displayName }]}
        canWrite
        onSaved={async () => undefined}
        onDirtyChange={onDirtyChange}
      />
    </QueryClientProvider>,
  );
  return onDirtyChange;
}

afterEach(cleanup);

describe("schema workbench", () => {
  it("suggests unique sibling keys and reports a manual collision inline", async () => {
    const user = userEvent.setup();
    const onDirtyChange = renderWorkbench();

    await user.click(screen.getByRole("button", { name: "Add Field" }));
    await user.click(screen.getByRole("button", { name: "Add Field" }));

    expect(screen.getByDisplayValue("untitled_field_2")).toBeTruthy();
    const apiKey = screen.getByLabelText("API Key");
    await user.clear(apiKey);
    await user.type(apiKey, "untitled_field");

    expect(
      screen.getAllByText(/sibling API key “untitled_field” is already in use/i).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Save Schema" }).hasAttribute("disabled")).toBe(true);
    expect(onDirtyChange).toHaveBeenCalledWith(true);
  });

  it("exposes enum and money type-specific settings", async () => {
    const user = userEvent.setup();
    renderWorkbench();

    await user.selectOptions(screen.getByLabelText("New Field Type"), "enum");
    await user.click(screen.getByRole("button", { name: "Add Field" }));
    expect(screen.getByRole("button", { name: "Add Option" })).toBeTruthy();
    expect(screen.getByLabelText("Default Option")).toBeTruthy();

    await user.selectOptions(screen.getByLabelText("Field Type"), "money");
    expect(screen.getByLabelText("Allowed Currencies")).toBeTruthy();
    expect(screen.getByLabelText("Default Amount")).toBeTruthy();
    expect(screen.getByLabelText("Default Currency")).toBeTruthy();
  });

  it("provides synchronized schema JSON and sample-inference entry points", async () => {
    const user = userEvent.setup();
    renderWorkbench();
    await user.click(screen.getByRole("tab", { name: "Schema JSON" }));

    expect(screen.getByRole("textbox", { name: /^Schema JSON$/u })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Apply JSON to Visual Draft" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Infer From Sample" })).toBeTruthy();
  });
});
