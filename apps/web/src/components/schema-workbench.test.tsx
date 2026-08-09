/** @vitest-environment jsdom */

import { CollectionDraftSchema } from "@framerfordevs/api/contracts/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
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

  it("uses type-appropriate default editors for text, temporal, structured, and rich values", async () => {
    const user = userEvent.setup();
    renderWorkbench();
    await user.click(screen.getByRole("button", { name: "Add Field" }));
    const fieldType = screen.getByLabelText("Field Type");

    await user.selectOptions(fieldType, "long_text");
    expect(screen.getByLabelText("Default Value").tagName).toBe("TEXTAREA");

    await user.selectOptions(fieldType, "url");
    expect(screen.getByLabelText("Default URL").getAttribute("type")).toBe("url");

    await user.selectOptions(fieldType, "number");
    expect(screen.getByLabelText("Default").getAttribute("type")).toBe("number");

    await user.selectOptions(fieldType, "date");
    expect(screen.getByLabelText("Default Date").getAttribute("type")).toBe("date");

    await user.selectOptions(fieldType, "date_time");
    expect(screen.getByLabelText("Default Date & Time").getAttribute("type")).toBe(
      "datetime-local",
    );

    await user.selectOptions(fieldType, "object");
    const objectDefault = screen.getByLabelText("Default Object");
    await user.click(objectDefault);
    await user.paste("[]");
    await user.tab();
    expect(screen.getByText("Enter a JSON object.")).toBeTruthy();

    await user.selectOptions(fieldType, "list");
    const listDefault = screen.getByLabelText("Default List");
    await user.click(listDefault);
    await user.paste("{}");
    await user.tab();
    expect(screen.getByText("Enter a JSON array.")).toBeTruthy();

    await user.selectOptions(fieldType, "rich_text");
    expect(screen.queryByLabelText("Default Portable Text Document")).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Bold" }).getAttribute("aria-checked")).toBe(
      "true",
    );
    await user.click(screen.getByRole("checkbox", { name: "Configure a Default Document" }));
    expect(await screen.findByRole("textbox", { name: "Default rich text content" })).toBeTruthy();
  });

  it("shows mixed localization only for object fields", async () => {
    const user = userEvent.setup();
    renderWorkbench();
    await user.click(screen.getByRole("button", { name: "Add Field" }));

    const localization = screen.getByLabelText("Localization");
    expect(within(localization).queryByRole("option", { name: "Mixed Object" })).toBeNull();
    await user.selectOptions(screen.getByLabelText("Field Type"), "object");
    expect(within(localization).getByRole("option", { name: "Mixed Object" })).toBeTruthy();
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
