/** @vitest-environment jsdom */

// Verifies exhaustive generated controls remain accessible and preview-only validation is local.

import { GeneratedFormDefinition } from "@framerfordevs/api/contracts/schema/index";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { Schema } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GeneratedForm } from "./index";

const editor = {
  helpText: "Generated from the schema contract.",
  placeholder: "Enter a value",
  visibleToRoles: ["owner", "developer"],
  editableByRoles: ["owner", "developer"],
};
const fields = [
  {
    id: "019fae8b-1234-7000-8000-000000000041",
    parentFieldId: null,
    nodeRole: "root",
    apiKey: "title",
    displayLabel: "Title",
    kind: "short_text",
    required: true,
    localization: "localized",
    deprecated: false,
    position: 0,
    editor,
    configuration: { minLength: 2 },
    children: [],
  },
  {
    id: "019fae8b-1234-7000-8000-000000000042",
    parentFieldId: null,
    nodeRole: "root",
    apiKey: "price",
    displayLabel: "Price",
    kind: "money",
    required: false,
    localization: "shared",
    deprecated: false,
    position: 1,
    editor,
    configuration: { currencies: ["USD", "JPY"] },
    children: [],
  },
  {
    id: "019fae8b-1234-7000-8000-000000000043",
    parentFieldId: null,
    nodeRole: "root",
    apiKey: "published_on",
    displayLabel: "Published on",
    kind: "date",
    required: false,
    localization: "shared",
    deprecated: false,
    position: 2,
    editor,
    configuration: {},
    children: [],
  },
  {
    id: "019fae8b-1234-7000-8000-000000000044",
    parentFieldId: null,
    nodeRole: "root",
    apiKey: "featured",
    displayLabel: "Featured",
    kind: "boolean",
    required: false,
    localization: "shared",
    deprecated: false,
    position: 3,
    editor,
    configuration: {},
    children: [],
  },
  {
    id: "019fae8b-1234-7000-8000-000000000045",
    parentFieldId: null,
    nodeRole: "root",
    apiKey: "body",
    displayLabel: "Body",
    kind: "rich_text",
    required: false,
    localization: "localized",
    deprecated: false,
    position: 4,
    editor,
    configuration: {},
    children: [],
  },
];

const definition = Schema.decodeUnknownSync(GeneratedFormDefinition)({
  source: "draft",
  collectionId: "019fae8b-1234-7000-8000-000000000040",
  revisionId: null,
  formatVersion: 2,
  validationProfile: "ffd-fields@1",
  currencyRegistryProfile: "iso-4217@2026-01-01",
  contractHash: "c".repeat(64),
  role: "owner",
  canEdit: true,
  fields,
  editableFieldIds: fields.map((field) => field.id),
  editorLayout: {
    version: 1,
    tabs: [
      {
        id: "00000000-0000-4000-8000-000000000041",
        title: "Content",
        description: "Preview controls",
        position: 0,
        visibleToRoles: ["owner", "developer"],
        groups: [
          {
            id: "00000000-0000-4000-8000-000000000042",
            title: "Main",
            description: null,
            position: 0,
            columns: 2,
            visibleToRoles: ["owner", "developer"],
            fields: fields.map((field, position) => ({
              id: field.id,
              fieldId: field.id,
              position,
              helpTextOverride: null,
              visibleToRoles: ["owner", "developer"],
            })),
          },
        ],
      },
    ],
    sidebarGroups: [],
  },
  currencyMinorUnits: { USD: 2, JPY: 0 },
});

afterEach(cleanup);

describe("generated form", () => {
  it("renders typed role-aware controls without detectable accessibility violations", async () => {
    const { container } = render(
      <GeneratedForm definition={definition} validationFields={definition.fields} />,
    );

    expect(screen.getByLabelText(/title/i)).toBeTruthy();
    expect(screen.getByLabelText(/price currency/i)).toBeTruthy();
    expect(screen.getByLabelText(/published on/i)).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /featured/i })).toBeTruthy();
    expect((await axe.run(container)).violations).toEqual([]);
  });

  it("reports required preview validation without persisting values", async () => {
    const user = userEvent.setup();
    render(<GeneratedForm definition={definition} validationFields={definition.fields} />);

    await user.click(screen.getByRole("button", { name: /validate preview/i }));
    expect(screen.getByText(/review the highlighted preview fields/i)).toBeTruthy();
    expect(screen.getByText(/this field is required/i)).toBeTruthy();
    expect(screen.getByText(/never saved/i)).toBeTruthy();
  });

  it("clears stale server issues when the corresponding value is edited", async () => {
    const user = userEvent.setup();
    const titleId = fields[0]?.id ?? "missing";
    render(
      <GeneratedForm
        definition={definition}
        validationFields={definition.fields}
        values={{}}
        onValuesChange={() => undefined}
        serverIssues={{ [titleId]: "This field is required." }}
      />,
    );

    expect(screen.getByText("This field is required.")).toBeTruthy();
    await user.type(screen.getByLabelText(/title/i), "Updated");
    expect(screen.queryByText("This field is required.")).toBeNull();
  });

  it("hydrates saved rich text into the lazy controlled editor", async () => {
    const document = {
      version: 1,
      profile: "ffd-portable-text",
      blocks: [
        {
          _key: "block-1",
          _type: "block",
          style: "normal",
          children: [{ _key: "span-1", _type: "span", text: "Saved body", marks: [] }],
          markDefs: [],
        },
      ],
    };
    render(
      <GeneratedForm
        definition={definition}
        validationFields={definition.fields}
        values={{ [fields[4]?.id ?? "missing"]: document }}
      />,
    );

    expect(await screen.findByText("Saved body")).toBeTruthy();
  });

  it("emits controlled values under stable field IDs and exposes save status", async () => {
    const user = userEvent.setup();
    const onValuesChange = vi.fn();
    const onSubmit = vi.fn();
    render(
      <GeneratedForm
        definition={definition}
        validationFields={definition.fields}
        values={{}}
        onValuesChange={onValuesChange}
        onSubmit={onSubmit}
        submitLabel="Save draft"
        statusMessage="Unsaved changes."
      />,
    );

    await user.type(screen.getByLabelText(/title/i), "A");
    expect(onValuesChange).toHaveBeenCalledWith({ [fields[0]?.id ?? "missing"]: "A" });
    await user.click(screen.getByRole("button", { name: /save draft/i }));
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(screen.getByText(/unsaved changes/i)).toBeTruthy();
  });
});
