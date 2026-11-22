import { describe, expect, it } from "vitest";

import type { StudioFormDto } from "../../../contracts/content";
import {
  formatStudioValue,
  studioChangedFieldSummary,
  studioComparisonChangeLabel,
  studioFieldLabels,
  studioRevisionAuthor,
  studioRevisionRestoreBlocker,
} from ".";

const titleId = "11111111-1111-4111-8111-111111111111";
const groupId = "22222222-2222-4222-8222-222222222222";
const childId = "33333333-3333-4333-8333-333333333333";

const form: StudioFormDto = {
  collectionId: "44444444-4444-4444-8444-444444444444",
  schemaRevisionId: "55555555-5555-4555-8555-555555555555",
  contractHash: "a".repeat(64),
  canEdit: true,
  fields: [
    {
      id: titleId,
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
      id: groupId,
      parentFieldId: null,
      nodeRole: "root",
      displayLabel: "SEO",
      kind: "object",
      required: false,
      localization: "localized",
      position: 1,
      helpText: null,
      placeholder: null,
      configuration: {},
      children: [
        {
          id: childId,
          parentFieldId: groupId,
          nodeRole: "object_property",
          displayLabel: "Description",
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
  editableFieldIds: [titleId],
  tabs: [],
  sidebarGroups: [],
  currencyMinorUnits: {},
};

describe("Studio history presentation", () => {
  it("labels nested fields and summarizes only visible changed fields", () => {
    const labels = studioFieldLabels(form);
    expect(labels.get(childId)).toBe("SEO › Description");
    expect(studioChangedFieldSummary({ changedFieldIds: [titleId, childId] }, labels)).toBe(
      "Changed Title, SEO › Description",
    );
    expect(
      studioChangedFieldSummary(
        { changedFieldIds: ["99999999-9999-4999-8999-999999999999"] },
        labels,
      ),
    ).toBe("No visible field changes");
    expect(
      studioChangedFieldSummary(
        { changedFieldIds: [titleId, groupId, childId, titleId, groupId] },
        labels,
      ),
    ).toBe("Changed Title, SEO, SEO › Description and 2 more");
  });

  it("names authors without exposing raw identities", () => {
    expect(
      studioRevisionAuthor({ authoredByUserId: "me", authoredByCredentialId: null }, "me"),
    ).toBe("You");
    expect(
      studioRevisionAuthor({ authoredByUserId: "other", authoredByCredentialId: null }, "me"),
    ).toBe("Another editor");
    expect(
      studioRevisionAuthor({ authoredByUserId: null, authoredByCredentialId: groupId }, "me"),
    ).toBe("An API credential");
    expect(
      studioRevisionAuthor({ authoredByUserId: null, authoredByCredentialId: null }, "me"),
    ).toBe("Unknown author");
  });

  it("formats bounded read-only values", () => {
    expect(formatStudioValue(undefined)).toBe("Empty");
    expect(formatStudioValue("")).toBe("Empty");
    expect(formatStudioValue(true)).toBe("Yes");
    expect(formatStudioValue(4.5)).toBe("4.5");
    expect(formatStudioValue({ amount: "1", currency: "USD" })).toBe(
      '{"amount":"1","currency":"USD"}',
    );
    expect(
      formatStudioValue({
        version: 1,
        profile: "ffd-portable-text",
        blocks: [{ children: [{ text: "Hello " }, { text: "world" }] }, { children: [] }],
      }),
    ).toBe("Hello world\n");
    const long = formatStudioValue("x".repeat(1_000));
    expect(long).toHaveLength(280);
    expect(long.endsWith("…")).toBe(true);
    expect(studioComparisonChangeLabel("removed")).toBe("Removed");
  });

  it("explains why a revision cannot be restored", () => {
    const revision = { id: titleId, compatible: true };
    expect(studioRevisionRestoreBlocker({ revision, headRevisionId: groupId, dirty: false })).toBe(
      null,
    );
    expect(
      studioRevisionRestoreBlocker({
        revision: { ...revision, compatible: false },
        headRevisionId: groupId,
        dirty: false,
      }),
    ).toContain("older content model");
    expect(
      studioRevisionRestoreBlocker({ revision, headRevisionId: titleId, dirty: false }),
    ).toContain("current draft");
    expect(
      studioRevisionRestoreBlocker({ revision, headRevisionId: groupId, dirty: true }),
    ).toContain("unsaved changes");
  });
});
