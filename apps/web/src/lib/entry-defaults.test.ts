// Verifies new-partition defaults are projected into stable field identities without replacing saved values.

import {
  CollectionFieldDefinition,
  defaultFieldEditorMetadata,
} from "@framerfordevs/api/contracts/schemas";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { applyGeneratedFormDefaults, applyNewEntryPartitionDefaults } from "./entry-defaults";

const rootId = "019fae8b-1234-7000-8000-000000000081";
const childId = "019fae8b-1234-7000-8000-000000000082";

const child = Schema.decodeUnknownSync(CollectionFieldDefinition)({
  id: childId,
  parentFieldId: rootId,
  nodeRole: "object_property",
  apiKey: "title",
  displayLabel: "Title",
  kind: "short_text",
  required: false,
  localization: "localized",
  deprecated: false,
  position: 0,
  editor: defaultFieldEditorMetadata,
  configuration: { default: "Default title" },
  children: [],
});

const mixedObject = Schema.decodeUnknownSync(CollectionFieldDefinition)({
  id: rootId,
  parentFieldId: null,
  nodeRole: "root",
  apiKey: "hero",
  displayLabel: "Hero",
  kind: "object",
  required: null,
  localization: "mixed",
  deprecated: false,
  position: 0,
  editor: defaultFieldEditorMetadata,
  configuration: {},
  children: [child],
});

const atomicObject = Schema.decodeUnknownSync(CollectionFieldDefinition)({
  ...mixedObject,
  required: false,
  localization: "localized",
  configuration: { default: { title: "Object default" } },
  children: [{ ...child, localization: null }],
});

describe("entry defaults", () => {
  it("synthesizes mixed-object child defaults under stable IDs", () => {
    expect(applyGeneratedFormDefaults([mixedObject], {})).toEqual({
      [rootId]: { [childId]: "Default title" },
    });
  });

  it("converts API-key object defaults to stable child IDs", () => {
    expect(applyGeneratedFormDefaults([atomicObject], {})).toEqual({
      [rootId]: { [childId]: "Object default" },
    });
  });

  it("never replaces a saved root value", () => {
    const saved = { [rootId]: { [childId]: "Saved title" } };
    expect(applyGeneratedFormDefaults([mixedObject], saved)).toEqual(saved);
  });

  it("does not resurrect defaults after a versioned partition is cleared", () => {
    expect(applyNewEntryPartitionDefaults([mixedObject], {}, 1)).toEqual({});
  });
});
