/** @vitest-environment jsdom */

import { AuthoringFieldPresentation } from "@framerfordevs/api/contracts/authoring/presentation/index";
import { EditorLayout } from "@framerfordevs/api/contracts/field/index";
import { CollectionFieldDefinition } from "@framerfordevs/api/contracts/schema/index";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { Schema } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LayoutGroupEditor, PresentationFieldCard } from "./index";

const fieldId = "019fae8b-1234-7000-8000-000000000201";
const draftId = "019fae8b-1234-7000-8000-000000000202";
const liveId = "019fae8b-1234-7000-8000-000000000203";
const roles = ["owner", "developer"] as const;

const field = Schema.decodeUnknownSync(CollectionFieldDefinition)({
  id: fieldId,
  parentFieldId: null,
  nodeRole: "root",
  apiKey: "status",
  displayLabel: "Status",
  kind: "enum",
  required: true,
  localization: "shared",
  deprecated: false,
  position: 0,
  editor: {
    helpText: null,
    placeholder: null,
    visibleToRoles: roles,
    editableByRoles: roles,
  },
  configuration: {
    options: [
      { id: draftId, value: "draft", label: "Draft", position: 0 },
      { id: liveId, value: "live", label: "Live", position: 1 },
    ],
  },
  children: [],
});

const presentation = Schema.decodeUnknownSync(AuthoringFieldPresentation)({
  fieldId,
  displayLabel: "Status",
  position: 0,
  editor: field.editor,
  enumOptions: [
    { optionId: draftId, label: "Draft", position: 0 },
    { optionId: liveId, label: "Live", position: 1 },
  ],
});

const layout = Schema.decodeUnknownSync(EditorLayout)({
  version: 1,
  tabs: [
    {
      id: "019fae8b-1234-7000-8000-000000000210",
      title: "Content",
      description: null,
      position: 0,
      visibleToRoles: roles,
      groups: [
        {
          id: "019fae8b-1234-7000-8000-000000000211",
          title: "Main",
          description: null,
          position: 0,
          columns: 1,
          visibleToRoles: roles,
          fields: [
            {
              id: "019fae8b-1234-7000-8000-000000000212",
              fieldId,
              position: 0,
              helpTextOverride: null,
              visibleToRoles: roles,
            },
          ],
        },
        {
          id: "019fae8b-1234-7000-8000-000000000213",
          title: "Secondary",
          description: null,
          position: 1,
          columns: 1,
          visibleToRoles: roles,
          fields: [],
        },
      ],
    },
  ],
  sidebarGroups: [],
});

afterEach(cleanup);

describe("presentation editor controls", () => {
  it("edits labels, enum order, and canonical role visibility accessibly", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(
      <PresentationFieldCard
        field={field}
        depth={0}
        presentation={presentation}
        siblingIndex={0}
        siblingCount={1}
        disabled={false}
        onChange={onChange}
        onMove={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText("Display label"), {
      target: { value: "Workflow status" },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ displayLabel: "Workflow status" }),
    );

    await user.click(screen.getByRole("button", { name: "Move Live up" }));
    const reordered = Schema.decodeUnknownSync(AuthoringFieldPresentation)(
      onChange.mock.calls.at(-1)?.[0],
    );
    expect(reordered.enumOptions.map((option) => option.optionId)).toEqual([liveId, draftId]);
    expect(reordered.enumOptions.map((option) => option.position)).toEqual([0, 1]);

    await user.click(screen.getByRole("checkbox", { name: "Content admin visible" }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        editor: expect.objectContaining({
          visibleToRoles: ["owner", "developer", "content_admin"],
        }),
      }),
    );
    expect((await axe.run(container)).violations).toEqual([]);
  });

  it("moves one stable placement between main and sidebar-capable groups", async () => {
    const user = userEvent.setup();
    const onLayoutChange = vi.fn();
    const group = layout.tabs[0]?.groups[0];
    if (!group) throw new Error("Layout group fixture is missing.");
    const { container } = render(
      <LayoutGroupEditor
        group={group}
        groupIndex={0}
        groupCount={2}
        layout={layout}
        rootFields={new Map([[field.id, field]])}
        disabled={false}
        onLayoutChange={onLayoutChange}
        onMoveGroup={() => undefined}
        onDelete={() => undefined}
        allowDeleteLast
      />,
    );
    await user.selectOptions(
      screen.getByLabelText("Group"),
      "019fae8b-1234-7000-8000-000000000213",
    );
    const moved = Schema.decodeUnknownSync(EditorLayout)(onLayoutChange.mock.calls.at(-1)?.[0]);
    expect(moved.tabs[0]?.groups[0]?.fields).toHaveLength(0);
    expect(moved.tabs[0]?.groups[1]?.fields[0]?.id).toBe("019fae8b-1234-7000-8000-000000000212");
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
