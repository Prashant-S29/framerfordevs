// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioContentClientError } from "../../../../content-client";
import type { StudioFormDto, StudioRevisionSummaryDto } from "../../../../contracts/content";
import { StudioHistoryPanel, type StudioHistoryPanelProps } from ".";

const client = {
  revisions: vi.fn(),
  revision: vi.fn(),
  compare: vi.fn(),
  restore: vi.fn(),
};

vi.mock("../../data", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../data")>();
  return { ...original, useStudioContentClient: () => client };
});

const ids = {
  collection: "11111111-1111-4111-8111-111111111111",
  entry: "22222222-2222-4222-8222-222222222222",
  field: "33333333-3333-4333-8333-333333333333",
  head: "44444444-4444-4444-8444-444444444444",
  older: "55555555-5555-4555-8555-555555555555",
  legacy: "66666666-6666-4666-8666-666666666666",
  schema: "77777777-7777-4777-8777-777777777777",
} as const;

const form: StudioFormDto = {
  collectionId: ids.collection,
  schemaRevisionId: ids.schema,
  contractHash: "a".repeat(64),
  canEdit: true,
  fields: [
    {
      id: ids.field,
      parentFieldId: null,
      nodeRole: "root",
      displayLabel: "Title",
      kind: "short_text",
      required: false,
      localization: "localized",
      position: 0,
      helpText: null,
      placeholder: null,
      configuration: {},
      children: [],
    },
  ],
  editableFieldIds: [ids.field],
  tabs: [],
  sidebarGroups: [],
  currencyMinorUnits: {},
};

function summary(
  id: string,
  sequence: number,
  compatible = true,
  author: string | null = "studio-user",
): StudioRevisionSummaryDto {
  return {
    id,
    scope: "localized",
    sequence,
    previousRevisionId: null,
    schemaRevisionId: ids.schema,
    contractHash: compatible ? "a".repeat(64) : "b".repeat(64),
    changedFieldIds: [ids.field],
    restoredFromRevisionId: null,
    authoredByUserId: author,
    authoredByCredentialId: null,
    authoredAt: "2026-09-29T10:00:00.000Z",
    compatible,
  };
}

function renderPanel(overrides: Partial<StudioHistoryPanelProps> = {}) {
  const onRestored = vi.fn(async (_message: string) => undefined);
  const onReloadLatest = vi.fn(async () => undefined);
  const props: StudioHistoryPanelProps = {
    collectionId: ids.collection,
    locale: "en",
    localeLabel: "English",
    entryId: ids.entry,
    currentUserId: "studio-user",
    form,
    visibleFieldIds: new Set([ids.field]),
    headRevisionIds: { shared: null, localized: ids.head },
    versions: { shared: 0, localized: 3 },
    canRestore: { shared: true, localized: true },
    dirty: false,
    onRestored,
    onReloadLatest,
    ...overrides,
  };
  const view = render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <StudioHistoryPanel {...props} />
    </QueryClientProvider>,
  );
  return { view, onRestored, onReloadLatest };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Studio history panel", () => {
  it("lists revisions with author, time, visible changes, and restore reasons", async () => {
    client.revisions.mockResolvedValue({
      items: [
        summary(ids.head, 3),
        summary(ids.older, 2, true, "someone-else"),
        summary(ids.legacy, 1, false),
      ],
      nextCursor: null,
    });
    const { view } = renderPanel();
    const toggle = screen.getByRole("button", { name: "Show history" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(client.revisions).not.toHaveBeenCalled();
    fireEvent.click(toggle);
    const list = await screen.findByRole("list", { name: "English revisions" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(within(list).getByText("Revision 3 (current draft)")).toBeTruthy();
    expect(within(list).getByText(/Another editor/u)).toBeTruthy();
    expect(within(list).getAllByText("Changed Title")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "Restore revision 3" })).toBeNull();
    const legacy = screen.getByRole("button", { name: "Restore revision 1" });
    expect(legacy.hasAttribute("disabled")).toBe(true);
    const reason = document.getElementById(legacy.getAttribute("aria-describedby") ?? "");
    expect(reason?.textContent).toContain("older content model");
    expect(client.revisions).toHaveBeenCalledWith(
      { collectionId: ids.collection, locale: "en", entryId: ids.entry },
      { scope: "localized", cursor: null, limit: 20 },
      new Set([ids.field]),
      expect.any(AbortSignal),
    );
    const results = await axe.run(view.container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations.filter((violation) => violation.impact === "serious")).toEqual([]);
  });

  it("restores a compatible revision only after confirmation", async () => {
    client.revisions.mockResolvedValue({
      items: [summary(ids.head, 3), summary(ids.older, 2)],
      nextCursor: null,
    });
    client.restore.mockResolvedValue({});
    const { onRestored } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Show history" }));
    fireEvent.click(await screen.findByRole("button", { name: "Restore revision 2" }));
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    expect(client.restore).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Restore revision" }));
    await waitFor(() => expect(onRestored).toHaveBeenCalledTimes(1));
    expect(client.restore.mock.calls[0]?.[1]).toBe(ids.older);
    expect(client.restore.mock.calls[0]?.[2]).toMatchObject({
      scope: "localized",
      schemaRevisionId: ids.schema,
      contractHash: "a".repeat(64),
      expectedVersion: 3,
    });
    expect(onRestored.mock.calls[0]?.[0]).toContain("Revision 2 restored");
  });

  it("disables restore while the editor has unsaved changes", async () => {
    client.revisions.mockResolvedValue({
      items: [summary(ids.head, 3), summary(ids.older, 2)],
      nextCursor: null,
    });
    renderPanel({ dirty: true });
    fireEvent.click(screen.getByRole("button", { name: "Show history" }));
    const restore = await screen.findByRole("button", { name: "Restore revision 2" });
    expect(restore.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/Save or discard your unsaved changes/u)).toBeTruthy();
  });

  it.each([
    ["DRAFT_VERSION_CONFLICT", "Reload latest draft"],
    ["REVISION_INCOMPATIBLE", null],
  ] as const)("recovers from %s", async (code, action) => {
    client.revisions.mockResolvedValue({
      items: [summary(ids.head, 3), summary(ids.older, 2)],
      nextCursor: null,
    });
    client.restore.mockRejectedValue(
      new StudioContentClientError({ status: 409, code, message: "Rejected.", retryable: false }),
    );
    const { onReloadLatest } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Show history" }));
    fireEvent.click(await screen.findByRole("button", { name: "Restore revision 2" }));
    fireEvent.click(await screen.findByRole("button", { name: "Restore revision" }));
    const alert = await screen.findByRole("alert");
    if (action === null) {
      expect(alert.textContent).toContain("different content model");
      expect(within(alert).queryByRole("button")).toBeNull();
    } else {
      fireEvent.click(within(alert).getByRole("button", { name: action }));
      expect(onReloadLatest).toHaveBeenCalledTimes(1);
    }
  });

  it("opens read-only values and a comparison with the current draft", async () => {
    client.revisions.mockResolvedValue({
      items: [summary(ids.head, 3), summary(ids.older, 2)],
      nextCursor: null,
    });
    client.revision.mockResolvedValue({
      revision: summary(ids.older, 2),
      values: { [ids.field]: "Old title" },
    });
    client.compare.mockResolvedValue({
      from: summary(ids.older, 2),
      to: summary(ids.head, 3),
      items: [
        {
          fieldId: ids.field,
          change: "changed",
          before: "Old title",
          after: "New title",
          inCurrentSchema: true,
        },
      ],
      restrictedChanges: true,
      schemaDiffers: false,
    });
    renderPanel({ canRestore: { shared: false, localized: false } });
    fireEvent.click(screen.getByRole("button", { name: "Show history" }));
    expect(await screen.findByRole("button", { name: "View revision 2" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Restore/u })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "View revision 2" }));
    expect(await screen.findByText("Old title")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]!);
    await waitFor(() => expect(screen.queryByText("Old title")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Compare revision 2 with current draft" }));
    expect(await screen.findByText("Current draft: New title")).toBeTruthy();
    expect(screen.getByText("Some changes are in fields you cannot view.")).toBeTruthy();
    expect(client.compare.mock.calls[0]?.[1]).toEqual({
      fromRevisionId: ids.older,
      toRevisionId: ids.head,
    });
  });
});
