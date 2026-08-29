// Projects verified local code structure through hosted source-identity presentation for read-only drift views.

import type { ProjectSchema, FieldSchema, ListItemSchema } from "@framerfordevs/schema";
import type { AuthoringFormField, AuthoringGeneratedForm } from "@framerfordevs/sdk/authoring";
import type {
  ContentEditorLayout,
  ContentFormDefinition,
  ContentFormField,
  ContentLayoutGroup,
} from "@framerfordevs/content-form";

interface HostedProjection {
  readonly fields: ReadonlyMap<string, AuthoringFormField>;
  readonly enumOptions: ReadonlyMap<
    string,
    ReadonlyMap<
      string,
      {
        readonly id: string;
        readonly value: string;
        readonly label: string;
        readonly position: number;
      }
    >
  >;
  readonly existingSourceKeys: ReadonlySet<string>;
}

type SchemaNode = FieldSchema | ListItemSchema;

function schemaChildren(field: SchemaNode): ReadonlyArray<SchemaNode> {
  if (field.kind === "object") return field.fields;
  if (field.kind === "list") return [field.item];
  return [];
}

function hostedChild(
  field: SchemaNode,
  candidates: ReadonlyArray<AuthoringFormField>,
): AuthoringFormField | undefined {
  if ("apiKey" in field) return candidates.find((candidate) => candidate.apiKey === field.apiKey);
  return candidates.find((candidate) => candidate.nodeRole === "list_item");
}

function collectHostedProjection(
  hostedProject: ProjectSchema,
  collectionSourceKey: string,
  form: AuthoringGeneratedForm,
): HostedProjection {
  const fields = new Map<string, AuthoringFormField>();
  const enumOptions = new Map<
    string,
    Map<
      string,
      {
        readonly id: string;
        readonly value: string;
        readonly label: string;
        readonly position: number;
      }
    >
  >();
  const existingSourceKeys = new Set<string>();
  const collection = hostedProject.collections.find(
    (candidate) => candidate.sourceKey === collectionSourceKey,
  );
  const visit = (
    schemaFields: ReadonlyArray<SchemaNode>,
    formFields: ReadonlyArray<AuthoringFormField>,
  ) => {
    for (const schemaField of schemaFields) {
      existingSourceKeys.add(schemaField.sourceKey);
      const projected = hostedChild(schemaField, formFields);
      if (projected !== undefined) {
        fields.set(schemaField.sourceKey, projected);
        if (schemaField.kind === "enum" && projected.kind === "enum") {
          const options = new Map<
            string,
            {
              readonly id: string;
              readonly value: string;
              readonly label: string;
              readonly position: number;
            }
          >();
          for (const option of schemaField.configuration.options) {
            const presentation = projected.configuration.options.find(
              (candidate) => candidate.value === option.value,
            );
            if (presentation !== undefined) options.set(option.sourceKey, presentation);
          }
          enumOptions.set(schemaField.sourceKey, options);
        }
        visit(schemaChildren(schemaField), projected.children);
      } else {
        visit(schemaChildren(schemaField), []);
      }
    }
  };
  visit(collection?.fields ?? [], form.fields);
  return { fields, enumOptions, existingSourceKeys };
}

function syntheticId(collectionSourceKey: string, sourceKey: string): string {
  return `local-${collectionSourceKey}-${sourceKey}`;
}

function projectField(
  field: SchemaNode,
  collectionSourceKey: string,
  projection: HostedProjection,
  parentFieldId: string | null,
  nodeRole: "root" | "object_property" | "list_item",
  position: number,
): ContentFormField | null {
  const hosted = projection.fields.get(field.sourceKey);
  if (hosted === undefined && projection.existingSourceKeys.has(field.sourceKey)) return null;
  const id = hosted?.id ?? syntheticId(collectionSourceKey, field.sourceKey);
  const base = {
    id,
    parentFieldId,
    nodeRole,
    apiKey: "apiKey" in field ? field.apiKey : null,
    displayLabel:
      hosted?.displayLabel ?? ("apiKey" in field ? field.apiKey : `List item: ${field.sourceKey}`),
    required: "required" in field ? field.required : null,
    localization: field.localization,
    position: hosted?.position ?? position,
    editor: {
      helpText: hosted?.editor.helpText ?? null,
      placeholder: hosted?.editor.placeholder ?? null,
    },
    children: schemaChildren(field).flatMap((child, index) => {
      const projected = projectField(
        child,
        collectionSourceKey,
        projection,
        id,
        field.kind === "list" ? "list_item" : "object_property",
        index,
      );
      return projected === null ? [] : [projected];
    }),
  };
  switch (field.kind) {
    case "short_text":
      return { ...base, kind: field.kind, configuration: field.configuration };
    case "long_text":
      return { ...base, kind: field.kind, configuration: field.configuration };
    case "rich_text":
      return { ...base, kind: field.kind, configuration: field.configuration };
    case "number":
      return { ...base, kind: field.kind, configuration: field.configuration };
    case "decimal":
      return { ...base, kind: field.kind, configuration: field.configuration };
    case "money":
      return { ...base, kind: field.kind, configuration: field.configuration };
    case "boolean":
      return { ...base, kind: field.kind, configuration: field.configuration };
    case "date":
      return { ...base, kind: field.kind, configuration: field.configuration };
    case "date_time":
      return { ...base, kind: field.kind, configuration: field.configuration };
    case "enum": {
      const hostedOptions = projection.enumOptions.get(field.sourceKey);
      return {
        ...base,
        kind: field.kind,
        configuration: {
          options: field.configuration.options.map((option, index) => {
            const hostedOption = hostedOptions?.get(option.sourceKey);
            return {
              id:
                hostedOption?.id ??
                syntheticId(collectionSourceKey, `${field.sourceKey}-${option.sourceKey}`),
              value: option.value,
              label: hostedOption?.label ?? option.value,
              position: hostedOption?.position ?? index,
            };
          }),
          ...(field.configuration.default === undefined
            ? {}
            : { default: field.configuration.default }),
        },
      };
    }
    case "url":
      return { ...base, kind: field.kind, configuration: field.configuration };
    case "email":
      return { ...base, kind: field.kind, configuration: field.configuration };
    case "slug":
      return { ...base, kind: field.kind, configuration: field.configuration };
    case "json":
      return { ...base, kind: field.kind, configuration: field.configuration };
    case "object":
      return { ...base, kind: field.kind, configuration: field.configuration };
    case "list":
      return { ...base, kind: field.kind, configuration: field.configuration };
    case "reference":
      return {
        ...base,
        kind: field.kind,
        configuration: {
          targetCollectionId: syntheticId(
            field.configuration.targetCollectionSourceKey,
            "collection",
          ),
        },
      };
    case "external_asset":
      return { ...base, kind: field.kind, configuration: field.configuration };
  }
}

function projectGroup(
  group: AuthoringGeneratedForm["editorLayout"]["tabs"][number]["groups"][number],
  rootIds: ReadonlySet<string>,
): ContentLayoutGroup | null {
  const fields = group.fields
    .filter((placement) => rootIds.has(placement.fieldId))
    .map((placement) => ({
      id: placement.id,
      fieldId: placement.fieldId,
      position: placement.position,
      helpTextOverride: placement.helpTextOverride,
    }));
  return fields.length === 0
    ? null
    : {
        id: group.id,
        title: group.title,
        description: group.description,
        position: group.position,
        columns: group.columns,
        fields,
      };
}

function projectLayout(
  form: AuthoringGeneratedForm,
  fields: ReadonlyArray<ContentFormField>,
  collectionSourceKey: string,
): ContentEditorLayout {
  const rootIds = new Set(fields.map((field) => field.id));
  const tabs = form.editorLayout.tabs.flatMap((tab) => {
    const groups = tab.groups.flatMap((group) => {
      const projected = projectGroup(group, rootIds);
      return projected === null ? [] : [projected];
    });
    return groups.length === 0
      ? []
      : [
          {
            id: tab.id,
            title: tab.title,
            description: tab.description,
            position: tab.position,
            groups,
          },
        ];
  });
  const sidebarGroups = form.editorLayout.sidebarGroups.flatMap((group) => {
    const projected = projectGroup(group, rootIds);
    return projected === null ? [] : [projected];
  });
  const placed = new Set([
    ...tabs.flatMap((tab) =>
      tab.groups.flatMap((group) => group.fields.map((item) => item.fieldId)),
    ),
    ...sidebarGroups.flatMap((group) => group.fields.map((item) => item.fieldId)),
  ]);
  const unplaced = fields.filter((field) => !placed.has(field.id));
  if (unplaced.length === 0) return { version: 1, tabs, sidebarGroups };
  const localGroup: ContentLayoutGroup = {
    id: syntheticId(collectionSourceKey, "layout-group"),
    title: "Local structure",
    description: "Fields not yet present in hosted presentation.",
    position: 99,
    columns: 1,
    fields: unplaced.map((field, index) => ({
      id: syntheticId(collectionSourceKey, `placement-${field.id}`),
      fieldId: field.id,
      position: index,
      helpTextOverride: null,
    })),
  };
  return {
    version: 1,
    tabs: [
      ...tabs,
      {
        id: syntheticId(collectionSourceKey, "layout-tab"),
        title: "Local structure",
        description: "Read-only fields from unpushed local code.",
        position: 99,
        groups: [localGroup],
      },
    ],
    sidebarGroups,
  };
}

export function projectLocalContentForm(input: {
  readonly localProject: ProjectSchema;
  readonly hostedProject: ProjectSchema;
  readonly collectionSourceKey: string;
  readonly hostedForm: AuthoringGeneratedForm;
}): ContentFormDefinition | null {
  const collection = input.localProject.collections.find(
    (candidate) => candidate.sourceKey === input.collectionSourceKey,
  );
  if (collection === undefined) return null;
  const projection = collectHostedProjection(
    input.hostedProject,
    input.collectionSourceKey,
    input.hostedForm,
  );
  const fields = collection.fields.flatMap((field, index) => {
    const projected = projectField(
      field,
      input.collectionSourceKey,
      projection,
      null,
      "root",
      index,
    );
    return projected === null ? [] : [projected];
  });
  return {
    canEdit: false,
    fields,
    editableFieldIds: [],
    editorLayout: projectLayout(input.hostedForm, fields, input.collectionSourceKey),
    currencyMinorUnits: input.hostedForm.currencyMinorUnits,
  };
}
