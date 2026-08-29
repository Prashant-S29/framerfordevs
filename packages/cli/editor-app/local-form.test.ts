import type { ProjectSchema } from "@framerfordevs/schema";
import { AuthoringGeneratedForm } from "@framerfordevs/sdk/authoring";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { projectLocalContentForm } from "./local-form";

const titleId = "019fae8b-1234-7000-8000-000000000001";
const statusId = "019fae8b-1234-7000-8000-000000000002";
const optionId = "019fae8b-1234-7000-8000-000000000003";
const layoutId = "019fae8b-1234-7000-8000-000000000004";

const hostedProject: ProjectSchema = {
  collections: [
    {
      sourceKey: "posts",
      apiKey: "posts",
      fields: [
        {
          sourceKey: "title",
          apiKey: "old_title",
          kind: "short_text",
          required: true,
          localization: "localized",
          configuration: {},
        },
        {
          sourceKey: "status",
          apiKey: "status",
          kind: "enum",
          required: true,
          localization: "shared",
          configuration: { options: [{ sourceKey: "draft", value: "draft" }] },
        },
        {
          sourceKey: "hidden",
          apiKey: "hidden",
          kind: "short_text",
          required: false,
          localization: "shared",
          configuration: {},
        },
      ],
    },
  ],
};

const localProject: ProjectSchema = {
  collections: [
    {
      sourceKey: "posts",
      apiKey: "posts",
      fields: [
        {
          sourceKey: "title",
          apiKey: "new_title",
          kind: "short_text",
          required: true,
          localization: "localized",
          configuration: { maxLength: 120 },
        },
        {
          sourceKey: "status",
          apiKey: "status",
          kind: "enum",
          required: true,
          localization: "shared",
          configuration: {
            options: [
              { sourceKey: "draft", value: "draft" },
              { sourceKey: "published", value: "published" },
            ],
          },
        },
        {
          sourceKey: "hidden",
          apiKey: "hidden",
          kind: "short_text",
          required: false,
          localization: "shared",
          configuration: {},
        },
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

const hostedForm = Schema.decodeUnknownSync(AuthoringGeneratedForm)({
  source: "published",
  collectionId: layoutId,
  revisionId: layoutId,
  formatVersion: 2,
  validationProfile: "ffd-fields@1",
  currencyRegistryProfile: null,
  contractHash: "a".repeat(64),
  role: "developer",
  canEdit: true,
  fields: [
    {
      id: titleId,
      parentFieldId: null,
      nodeRole: "root",
      apiKey: "old_title",
      displayLabel: "Hosted title",
      kind: "short_text",
      required: true,
      localization: "localized",
      deprecated: false,
      position: 0,
      editor: {
        helpText: "Presentation help",
        placeholder: "Presentation placeholder",
        visibleToRoles: ["developer"],
        editableByRoles: ["developer"],
      },
      configuration: {},
      children: [],
    },
    {
      id: statusId,
      parentFieldId: null,
      nodeRole: "root",
      apiKey: "status",
      displayLabel: "Status",
      kind: "enum",
      required: true,
      localization: "shared",
      deprecated: false,
      position: 1,
      editor: {
        helpText: null,
        placeholder: null,
        visibleToRoles: ["developer"],
        editableByRoles: ["developer"],
      },
      configuration: {
        options: [{ id: optionId, value: "draft", label: "Draft label", position: 0 }],
      },
      children: [],
    },
  ],
  editableFieldIds: [titleId, statusId],
  editorLayout: {
    version: 1,
    tabs: [
      {
        id: layoutId,
        title: "Content",
        description: null,
        position: 0,
        visibleToRoles: ["developer"],
        groups: [
          {
            id: layoutId,
            title: "Main",
            description: null,
            position: 0,
            columns: 1,
            visibleToRoles: ["developer"],
            fields: [
              {
                id: titleId,
                fieldId: titleId,
                position: 0,
                helpTextOverride: null,
                visibleToRoles: ["developer"],
              },
              {
                id: statusId,
                fieldId: statusId,
                position: 1,
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
});

describe("local drift form projection", () => {
  it("merges code structure through source identity while preserving hosted presentation", () => {
    const definition = projectLocalContentForm({
      localProject,
      hostedProject,
      collectionSourceKey: "posts",
      hostedForm,
    });
    expect(definition).not.toBeNull();
    if (definition === null) return;

    expect(definition.canEdit).toBe(false);
    expect(definition.editableFieldIds).toEqual([]);
    expect(definition.fields.map((field) => field.apiKey)).toEqual([
      "new_title",
      "status",
      "summary",
    ]);
    expect(definition.fields[0]).toMatchObject({
      id: titleId,
      apiKey: "new_title",
      displayLabel: "Hosted title",
      configuration: { maxLength: 120 },
      editor: {
        helpText: "Presentation help",
        placeholder: "Presentation placeholder",
      },
    });
    expect(definition.fields.some((field) => field.apiKey === "hidden")).toBe(false);

    const status = definition.fields.find((field) => field.apiKey === "status");
    expect(status?.kind).toBe("enum");
    if (status?.kind !== "enum") return;
    expect(status.configuration.options).toEqual([
      { id: optionId, value: "draft", label: "Draft label", position: 0 },
      {
        id: "local-posts-status-published",
        value: "published",
        label: "published",
        position: 1,
      },
    ]);
    expect(definition.editorLayout.tabs.map((tab) => tab.title)).toEqual([
      "Content",
      "Local structure",
    ]);
  });

  it("returns no form for a collection absent from local code", () => {
    expect(
      projectLocalContentForm({
        localProject,
        hostedProject,
        collectionSourceKey: "missing",
        hostedForm,
      }),
    ).toBeNull();
  });
});
