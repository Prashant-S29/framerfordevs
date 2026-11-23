import { describe, expect, it } from "vitest";

import type { StudioPresentationDto } from "../../../../contracts/presentation";
import { layoutDraft, layoutDraftValid, layoutPublishBody, moveItem, movePlacement } from ".";

const ids = {
  collection: "11111111-1111-4111-8111-111111111111",
  revision: "22222222-2222-4222-8222-222222222222",
  title: "33333333-3333-4333-8333-333333333333",
  status: "44444444-4444-4444-8444-444444444444",
  draft: "55555555-5555-4555-8555-555555555555",
  live: "66666666-6666-4666-8666-666666666666",
  tab: "77777777-7777-4777-8777-777777777777",
  main: "88888888-8888-4888-8888-888888888888",
  side: "99999999-9999-4999-8999-999999999999",
  command: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};

const presentation: StudioPresentationDto = {
  collectionId: ids.collection,
  revisionId: ids.revision,
  sequence: 4,
  presentation: {
    displayName: "Articles",
    description: null,
    fields: [
      {
        fieldId: ids.title,
        parentFieldId: null,
        kind: "short_text",
        displayLabel: "Title",
        position: 0,
        helpText: null,
        placeholder: null,
        enumOptions: [],
      },
      {
        fieldId: ids.status,
        parentFieldId: null,
        kind: "enum",
        displayLabel: null,
        position: 1,
        helpText: "Pick one",
        placeholder: null,
        enumOptions: [
          { optionId: ids.live, label: "Live", position: 1 },
          { optionId: ids.draft, label: "Draft", position: 0 },
        ],
      },
    ],
    layout: {
      tabs: [
        {
          id: ids.tab,
          title: "Content",
          description: null,
          position: 0,
          groups: [
            {
              id: ids.main,
              title: "Main",
              description: null,
              position: 0,
              columns: 1,
              fields: [
                { fieldId: ids.status, position: 1, helpTextOverride: null },
                { fieldId: ids.title, position: 0, helpTextOverride: null },
              ],
            },
          ],
        },
      ],
      sidebarGroups: [
        { id: ids.side, title: "Side", description: null, position: 0, columns: 1, fields: [] },
      ],
    },
  },
};

describe("form layout draft", () => {
  it("orders by position and round-trips to a dense publish body without role lists", () => {
    const draft = layoutDraft(presentation);
    expect(draft.tabs[0]?.groups[0]?.fields.map((field) => field.fieldId)).toEqual([
      ids.title,
      ids.status,
    ]);
    expect(draft.fields[1]?.enumOptions.map((option) => option.label)).toEqual(["Draft", "Live"]);
    const body = layoutPublishBody(presentation, draft, ids.command);
    expect(body).toMatchObject({
      commandId: ids.command,
      expectedRevisionId: ids.revision,
      expectedSequence: 4,
    });
    expect(JSON.stringify(body)).not.toContain("visibleToRoles");
    expect(JSON.stringify(body)).toContain('"displayLabel":null');
  });

  it("moves placements between groups and items within bounds", () => {
    const draft = layoutDraft(presentation);
    const moved = movePlacement(draft, ids.status, ids.side);
    expect(moved.tabs[0]?.groups[0]?.fields.map((field) => field.fieldId)).toEqual([ids.title]);
    expect(moved.sidebarGroups[0]?.fields.map((field) => field.fieldId)).toEqual([ids.status]);
    expect(movePlacement(draft, ids.status, ids.main)).toBe(draft);
    expect(moveItem(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(moveItem(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
  });

  it("requires names and titles before publishing", () => {
    const draft = layoutDraft(presentation);
    expect(layoutDraftValid(draft)).toBe(true);
    expect(layoutDraftValid({ ...draft, displayName: " " })).toBe(false);
    expect(
      layoutDraftValid({
        ...draft,
        tabs: draft.tabs.map((tab) => ({ ...tab, title: "" })),
      }),
    ).toBe(false);
  });
});
