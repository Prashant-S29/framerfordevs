/** @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ContentForm } from "./index";
import type { ContentFormDefinition, ContentFormField } from "../model";

vi.mock("../portable-text-field", () => ({
  default: ({ value }: { readonly value: unknown }) => (
    <output aria-label="Rich text value">{JSON.stringify(value)}</output>
  ),
}));

const editor = { helpText: "Field help", placeholder: "Enter a value" };
const base = {
  parentFieldId: null,
  nodeRole: "root" as const,
  required: false,
  localization: "localized" as const,
  position: 0,
  editor,
  children: [],
};
const fields: ReadonlyArray<ContentFormField> = [
  {
    ...base,
    id: "short",
    apiKey: "short",
    displayLabel: "Short text",
    kind: "short_text",
    required: true,
    configuration: { minLength: 2 },
  },
  {
    ...base,
    id: "long",
    apiKey: "long",
    displayLabel: "Long text",
    kind: "long_text",
    configuration: {},
  },
  {
    ...base,
    id: "rich",
    apiKey: "rich",
    displayLabel: "Rich text",
    kind: "rich_text",
    configuration: {},
  },
  {
    ...base,
    id: "number",
    apiKey: "number",
    displayLabel: "Number",
    kind: "number",
    configuration: { mode: "integer" },
  },
  {
    ...base,
    id: "decimal",
    apiKey: "decimal",
    displayLabel: "Decimal",
    kind: "decimal",
    configuration: {},
  },
  {
    ...base,
    id: "money",
    apiKey: "money",
    displayLabel: "Money",
    kind: "money",
    configuration: { currencies: ["USD", "JPY"] },
  },
  {
    ...base,
    id: "boolean",
    apiKey: "boolean",
    displayLabel: "Boolean",
    kind: "boolean",
    configuration: {},
  },
  {
    ...base,
    id: "date",
    apiKey: "date",
    displayLabel: "Date",
    kind: "date",
    configuration: {},
  },
  {
    ...base,
    id: "date_time",
    apiKey: "date_time",
    displayLabel: "Date time",
    kind: "date_time",
    configuration: {},
  },
  {
    ...base,
    id: "enum",
    apiKey: "enum",
    displayLabel: "Enum",
    kind: "enum",
    configuration: {
      options: [
        { id: "first", value: "first", label: "First", position: 1 },
        { id: "second", value: "second", label: "Second", position: 0 },
      ],
    },
  },
  {
    ...base,
    id: "url",
    apiKey: "url",
    displayLabel: "URL",
    kind: "url",
    configuration: {},
  },
  {
    ...base,
    id: "email",
    apiKey: "email",
    displayLabel: "Email",
    kind: "email",
    configuration: {},
  },
  {
    ...base,
    id: "slug",
    apiKey: "slug",
    displayLabel: "Slug",
    kind: "slug",
    configuration: {},
  },
  {
    ...base,
    id: "json",
    apiKey: "json",
    displayLabel: "JSON",
    kind: "json",
    configuration: {},
  },
  {
    ...base,
    id: "object",
    apiKey: "object",
    displayLabel: "Object",
    kind: "object",
    configuration: {},
    children: [
      {
        ...base,
        id: "object-child",
        parentFieldId: "object",
        nodeRole: "object_property",
        apiKey: "child",
        displayLabel: "Object child",
        kind: "short_text",
        localization: null,
        configuration: {},
      },
    ],
  },
  {
    ...base,
    id: "list",
    apiKey: "list",
    displayLabel: "List",
    kind: "list",
    configuration: { maxItems: 2 },
    children: [
      {
        ...base,
        id: "list-item",
        parentFieldId: "list",
        nodeRole: "list_item",
        apiKey: null,
        displayLabel: "List item",
        kind: "short_text",
        localization: null,
        configuration: {},
      },
    ],
  },
  {
    ...base,
    id: "reference",
    apiKey: "reference",
    displayLabel: "Reference",
    kind: "reference",
    configuration: { targetCollectionId: "target" },
  },
  {
    ...base,
    id: "asset",
    apiKey: "asset",
    displayLabel: "Asset",
    kind: "external_asset",
    configuration: {},
  },
];

const placement = (fieldId: string, position: number, helpTextOverride: string | null = null) => ({
  id: `placement-${fieldId}`,
  fieldId,
  position,
  helpTextOverride,
});

const definition: ContentFormDefinition = {
  canEdit: true,
  fields,
  editableFieldIds: fields.map((field) => field.id),
  editorLayout: {
    version: 1,
    tabs: [
      {
        id: "tab-main",
        title: "Main",
        description: "Primary fields",
        position: 0,
        groups: [
          {
            id: "group-main",
            title: "Main fields",
            description: "Main group description",
            position: 0,
            columns: 2,
            fields: fields.slice(0, 13).map((field, index) => placement(field.id, index)),
          },
        ],
      },
      {
        id: "tab-structured",
        title: "Structured",
        description: null,
        position: 1,
        groups: [
          {
            id: "group-structured",
            title: "Structured fields",
            description: null,
            position: 0,
            columns: 1,
            fields: fields.slice(13, 17).map((field, index) => placement(field.id, index)),
          },
        ],
      },
    ],
    sidebarGroups: [
      {
        id: "group-sidebar",
        title: "Sidebar fields",
        description: null,
        position: 0,
        columns: 1,
        fields: [placement("asset", 0, "Placement-specific help")],
      },
    ],
  },
  currencyMinorUnits: { USD: 2, JPY: 0 },
};

const requiredValidator = (field: ContentFormField, value: unknown) => ({
  issues:
    field.required === true && (value === undefined || value === "")
      ? [{ message: "This field is required." }]
      : [],
});

function ControlledHarness({
  onValuesChange,
}: {
  readonly onValuesChange: (values: Readonly<Record<string, unknown>>) => void;
}) {
  const [values, setValues] = useState<Readonly<Record<string, unknown>>>(() => ({
    object: { "object-child": "Before" },
    list: ["First"],
  }));
  return (
    <ContentForm
      definition={definition}
      values={values}
      onValuesChange={(next) => {
        setValues(next);
        onValuesChange(next);
      }}
      serverIssues={{ short: "Server title issue", reference: "Server reference issue" }}
    />
  );
}

afterEach(cleanup);

describe("content form", () => {
  it("renders all 18 kinds across tabs and sidebar without accessibility violations", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ContentForm
        definition={definition}
        values={{ list: ["First"], rich: { version: 1, profile: "ffd-portable-text", blocks: [] } }}
      />,
    );

    expect(screen.getByRole("tab", { name: "Main" })).toBeTruthy();
    expect(screen.getByLabelText("Short text (required)")).toBeTruthy();
    expect(screen.getByLabelText("Money currency")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Boolean" })).toBeTruthy();
    expect(await screen.findByLabelText("Rich text value")).toBeTruthy();
    expect(screen.getByLabelText("HTTPS URL")).toBeTruthy();
    expect(screen.getByText("Placement-specific help")).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "Structured" }));
    expect(screen.getByLabelText("JSON")).toBeTruthy();
    expect(screen.getByLabelText("Object child")).toBeTruthy();
    expect(screen.getByLabelText("List item")).toBeTruthy();
    expect(screen.getByLabelText("Reference")).toBeTruthy();
    expect((await axe.run(container)).violations).toEqual([]);
  });

  it("isolates IDs and invalid focus across simultaneous form instances", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <>
        <ContentForm definition={definition} validateField={requiredValidator} />
        <ContentForm definition={definition} validateField={requiredValidator} />
      </>,
    );
    const ids = [...container.querySelectorAll<HTMLElement>("[id]")].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);

    const forms = container.querySelectorAll("form");
    const second = forms.item(1);
    await user.click(within(second).getByRole("button", { name: "Validate preview" }));
    expect(within(second).getByLabelText("Short text (required)")).toBe(document.activeElement);
    expect(within(forms.item(0)).getByLabelText("Short text (required)")).not.toBe(
      document.activeElement,
    );
  });

  it("preserves recursive controlled values and clears only edited server issues", async () => {
    const user = userEvent.setup();
    const onValuesChange = vi.fn();
    render(<ControlledHarness onValuesChange={onValuesChange} />);

    await user.type(screen.getByLabelText("Short text (required)"), "A");
    expect(screen.queryByText("Server title issue")).toBeNull();
    await user.click(screen.getByRole("tab", { name: "Structured" }));
    expect(screen.getByText("Server reference issue")).toBeTruthy();
    await user.clear(screen.getByLabelText("Object child"));
    await user.type(screen.getByLabelText("Object child"), "After");
    expect(onValuesChange).toHaveBeenCalledWith({
      short: "A",
      object: { "object-child": "After" },
      list: ["First"],
    });
    await user.click(screen.getByRole("button", { name: "Add item" }));
    expect(onValuesChange).toHaveBeenCalledWith({
      short: "A",
      object: { "object-child": "After" },
      list: ["First", undefined],
    });
  });

  it("honors form-wide and field-specific read-only authority", () => {
    render(
      <ContentForm
        definition={{ ...definition, editableFieldIds: ["short"] }}
        values={{ short: "Editable", long: "Read only" }}
      />,
    );
    expect(screen.getByLabelText("Short text (required)").hasAttribute("disabled")).toBe(false);
    expect(screen.getByLabelText("Long text").hasAttribute("disabled")).toBe(true);
  });
});
