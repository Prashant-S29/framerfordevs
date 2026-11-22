// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioContentClientError } from "../../../../content-client";
import type {
  StudioFormDto,
  StudioPublicationPlanDto,
  StudioPublicationStatusDto,
} from "../../../../contracts/content";
import { StudioPublicationBadge } from "../badge";
import { StudioPublicationPanel } from ".";

const client = {
  validatePublication: vi.fn(),
  publish: vi.fn(),
  unpublish: vi.fn(),
};

vi.mock("../../data", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../data")>();
  return { ...original, useStudioContentClient: () => client };
});

const ids = {
  collection: "11111111-1111-4111-8111-111111111111",
  entry: "22222222-2222-4222-8222-222222222222",
  field: "33333333-3333-4333-8333-333333333333",
  publication: "44444444-4444-4444-8444-444444444444",
  schema: "55555555-5555-4555-8555-555555555555",
  revision: "66666666-6666-4666-8666-666666666666",
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
      required: true,
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
const publicationSummary = {
  id: ids.publication,
  sequence: 2,
  schemaRevisionId: ids.schema,
  contractHash: "a".repeat(64),
  changedFieldIds: [ids.field],
  publishedAt: "2026-09-29T10:00:00.000Z",
  current: true,
};
const published: StudioPublicationStatusDto = {
  state: "published",
  stateVersion: 2,
  currentPublication: publicationSummary,
  sharedChanged: false,
  localizedChanged: true,
  schemaChanged: false,
  changedSincePublication: true,
};
const neverPublished: StudioPublicationStatusDto = {
  ...published,
  state: "never_published",
  stateVersion: 0,
  currentPublication: null,
  changedSincePublication: false,
};
const validPlan: StudioPublicationPlanDto = {
  authorityHash: "b".repeat(64),
  stateVersion: 0,
  currentPublicationId: null,
  schemaRevisionId: ids.schema,
  contractHash: "a".repeat(64),
  sharedVersion: 0,
  sharedRevisionId: null,
  localizedVersion: 1,
  localizedRevisionId: ids.revision,
  wouldCreatePublication: true,
  validation: { status: "valid", issues: [], capped: false },
  entryIssues: [],
};

function renderPanel(status: StudioPublicationStatusDto, dirty = false) {
  const onReloadLatest = vi.fn(async () => undefined);
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <StudioPublicationPanel
        collectionId={ids.collection}
        locale="en"
        localeLabel="English"
        entryId={ids.entry}
        form={form}
        visibleFieldIds={new Set([ids.field])}
        status={status}
        dirty={dirty}
        onReloadLatest={onReloadLatest}
      />
    </QueryClientProvider>,
  );
  return { view, onReloadLatest };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Studio publication panel", () => {
  it.each([
    [published, "Changed since publish"],
    [{ ...published, changedSincePublication: false }, "Published"],
    [{ ...published, state: "unpublished" as const, currentPublication: null }, "Unpublished"],
    [neverPublished, "Never published"],
  ])("shows a text publication badge", (status, label) => {
    render(<StudioPublicationBadge status={status} />);
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText("Publication status:")).toBeTruthy();
  });

  it("checks the plan, shows issues, and offers no publish action while invalid", async () => {
    client.validatePublication.mockResolvedValue({
      ...validPlan,
      authorityHash: null,
      validation: {
        status: "invalid",
        issues: [
          {
            fieldId: ids.field,
            path: `field/${ids.field}`,
            scope: "localized",
            localeId: null,
            locale: "en",
            code: "required",
            message: "This field value is invalid.",
          },
        ],
        capped: false,
      },
      entryIssues: [
        { code: "reference_unpublished", message: "A referenced entry is unpublished." },
      ],
    });
    const { view } = renderPanel(neverPublished);
    fireEvent.click(screen.getByRole("button", { name: "Check publication" }));
    const issues = await screen.findByRole("list", { name: "Publication issues" });
    expect(within(issues).getByText("Title: This field value is invalid.")).toBeTruthy();
    expect(within(issues).getByText("A referenced entry is unpublished.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Publish English" })).toBeNull();
    const results = await axe.run(view.container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations.filter((violation) => violation.impact === "serious")).toEqual([]);
  });

  it("explains restricted issues without naming hidden fields", async () => {
    client.validatePublication.mockResolvedValue({
      ...validPlan,
      authorityHash: null,
      validation: { status: "restricted_issues", issues: [], capped: false },
    });
    renderPanel(neverPublished);
    fireEvent.click(screen.getByRole("button", { name: "Check publication" }));
    expect(
      await screen.findByText(/A field that you cannot view blocks publication/u),
    ).toBeTruthy();
  });

  it("publishes a valid plan with its exact authority and shows the Delivery read-back", async () => {
    client.validatePublication.mockResolvedValue(validPlan);
    client.publish.mockResolvedValue({
      commandId: ids.revision,
      resultKind: "changed",
      stateVersion: 1,
      publication: { ...publicationSummary, sequence: 1 },
      delivery: { status: "verified", currentPublicationId: ids.publication },
    });
    renderPanel(neverPublished);
    fireEvent.click(screen.getByRole("button", { name: "Check publication" }));
    fireEvent.click(await screen.findByRole("button", { name: "Publish English" }));
    expect(await screen.findByText(/Delivery now serves publication 1 for English/u)).toBeTruthy();
    expect(client.publish.mock.calls[0]?.[1]).toMatchObject({
      authorityHash: "b".repeat(64),
      expectedStateVersion: 0,
      expectedPublicationId: null,
      expectedLocalizedVersion: 1,
      expectedLocalizedRevisionId: ids.revision,
    });
  });

  it("recovers from a stale publication state by checking again", async () => {
    client.validatePublication.mockResolvedValue(validPlan);
    client.publish.mockRejectedValue(
      new StudioContentClientError({
        status: 409,
        code: "PUBLICATION_STATE_CONFLICT",
        message: "Stale.",
        retryable: false,
      }),
    );
    renderPanel(neverPublished);
    fireEvent.click(screen.getByRole("button", { name: "Check publication" }));
    fireEvent.click(await screen.findByRole("button", { name: "Publish English" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("changed since you checked");
    fireEvent.click(within(alert).getByRole("button", { name: "Check publication again" }));
    await waitFor(() => expect(client.validatePublication).toHaveBeenCalledTimes(2));
  });

  it("offers an exact retry after an ambiguous publish failure", async () => {
    client.validatePublication.mockResolvedValue(validPlan);
    client.publish.mockRejectedValueOnce(
      new StudioContentClientError({
        status: 503,
        code: "SERVICE_UNAVAILABLE",
        message: "Unavailable.",
        retryable: true,
      }),
    );
    client.publish.mockResolvedValueOnce({
      commandId: ids.revision,
      resultKind: "no_op",
      stateVersion: 1,
      publication: publicationSummary,
      delivery: { status: "verified", currentPublicationId: ids.publication },
    });
    renderPanel(neverPublished);
    fireEvent.click(screen.getByRole("button", { name: "Check publication" }));
    fireEvent.click(await screen.findByRole("button", { name: "Publish English" }));
    fireEvent.click(await screen.findByRole("button", { name: "Retry the exact request" }));
    expect(await screen.findByText(/Already published/u)).toBeTruthy();
    expect(client.publish.mock.calls[1]?.[1]).toEqual(client.publish.mock.calls[0]?.[1]);
  });

  it("unpublishes only after confirmation", async () => {
    client.unpublish.mockResolvedValue({
      commandId: ids.revision,
      resultKind: "changed",
      stateVersion: 3,
      unpublishedPublicationId: ids.publication,
      unpublishedAt: "2026-09-29T11:00:00.000Z",
      delivery: { status: "verified", currentPublicationId: null },
    });
    renderPanel(published);
    fireEvent.click(screen.getByRole("button", { name: "Unpublish English" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("Other locales stay published");
    expect(client.unpublish).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Unpublish" }));
    expect(await screen.findByText(/no longer serves this entry in English/u)).toBeTruthy();
    expect(client.unpublish.mock.calls[0]?.[1]).toMatchObject({
      expectedStateVersion: 2,
      expectedPublicationId: ids.publication,
    });
  });

  it("blocks publication checks while the draft has unsaved changes", () => {
    renderPanel(neverPublished, true);
    const check = screen.getByRole("button", { name: "Check publication" });
    expect(check.hasAttribute("disabled")).toBe(true);
    const reason = document.getElementById(check.getAttribute("aria-describedby") ?? "");
    expect(reason?.textContent).toContain("Save your changes before you publish");
  });
});
