import { assert, describe, it } from "@effect/vitest";
import { Schema } from "effect";

import { EntryValueMutations } from "../../../contracts/entry";
import { StudioFormProjection } from "../../../contracts/studio-content";
import { studioMutationsUseProjectedAuthority } from ".";

const ids = {
  collection: "019fae8b-1234-7000-8000-000000000001",
  revision: "019fae8b-1234-7000-8000-000000000002",
  visible: "019fae8b-1234-7000-8000-000000000003",
  object: "019fae8b-1234-7000-8000-000000000004",
  child: "019fae8b-1234-7000-8000-000000000005",
  hidden: "019fae8b-1234-7000-8000-000000000006",
  tab: "019fae8b-1234-7000-8000-000000000007",
  group: "019fae8b-1234-7000-8000-000000000008",
  placement: "019fae8b-1234-7000-8000-000000000009",
};

const form = Schema.decodeUnknownSync(StudioFormProjection)({
  collectionId: ids.collection,
  schemaRevisionId: ids.revision,
  contractHash: "a".repeat(64),
  canEdit: true,
  fields: [
    {
      id: ids.visible,
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
    {
      id: ids.object,
      parentFieldId: null,
      nodeRole: "root",
      displayLabel: "Details",
      kind: "object",
      required: false,
      localization: "localized",
      position: 1,
      helpText: null,
      placeholder: null,
      configuration: {},
      children: [
        {
          id: ids.child,
          parentFieldId: ids.object,
          nodeRole: "object_property",
          displayLabel: "Summary",
          kind: "short_text",
          required: false,
          localization: null,
          position: 0,
          helpText: null,
          placeholder: null,
          configuration: {},
          children: [],
        },
      ],
    },
  ],
  editableFieldIds: [ids.visible, ids.object, ids.child],
  tabs: [
    {
      id: ids.tab,
      title: "Content",
      description: null,
      position: 0,
      groups: [
        {
          id: ids.group,
          title: "Main",
          description: null,
          position: 0,
          columns: 1,
          fields: [
            {
              id: ids.placement,
              fieldId: ids.visible,
              position: 0,
              helpTextOverride: null,
            },
          ],
        },
      ],
    },
  ],
  sidebarGroups: [],
  currencyMinorUnits: {},
});

function mutations(value: unknown) {
  return Schema.decodeUnknownSync(EntryValueMutations)(value);
}

describe("Studio projected mutation authority", () => {
  it("accepts projected paths and rejects guessed hidden roots", () => {
    assert.isTrue(
      studioMutationsUseProjectedAuthority(
        mutations([{ operation: "set", path: [ids.visible], value: "Visible" }]),
        form,
      ),
    );
    assert.isFalse(
      studioMutationsUseProjectedAuthority(
        mutations([{ operation: "set", path: [ids.hidden], value: "Hidden" }]),
        form,
      ),
    );
  });

  it("rejects mutation values deeper than the shared JSON bound", () => {
    const nested = (depth: number): unknown => {
      let value: unknown = "leaf";
      for (let index = 0; index < depth; index += 1) value = { child: value };
      return value;
    };

    assert.isTrue(
      studioMutationsUseProjectedAuthority(
        mutations([{ operation: "set", path: [ids.visible], value: nested(24) }]),
        form,
      ),
    );
    assert.isFalse(
      studioMutationsUseProjectedAuthority(
        mutations([{ operation: "set", path: [ids.visible], value: nested(25) }]),
        form,
      ),
    );
  });

  it("enforces the exact mutation node bound and rejects cycles", () => {
    const exact = Array.from({ length: 9_999 }, () => null);
    const excess = Array.from({ length: 10_000 }, () => null);
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const path = form.fields.slice(0, 1).map((field) => field.id);

    assert.isTrue(
      studioMutationsUseProjectedAuthority([{ operation: "set", path, value: exact }], form),
    );
    assert.isFalse(
      studioMutationsUseProjectedAuthority([{ operation: "set", path, value: excess }], form),
    );
    assert.isFalse(
      studioMutationsUseProjectedAuthority([{ operation: "set", path, value: cycle }], form),
    );
  });

  it("rejects hidden stable IDs nested inside object snapshots", () => {
    assert.isTrue(
      studioMutationsUseProjectedAuthority(
        mutations([
          {
            operation: "set",
            path: [ids.object],
            value: { [ids.child]: "Visible" },
          },
        ]),
        form,
      ),
    );
    assert.isFalse(
      studioMutationsUseProjectedAuthority(
        mutations([
          {
            operation: "set",
            path: [ids.object],
            value: { [ids.hidden]: "Hidden" },
          },
        ]),
        form,
      ),
    );
  });
});
