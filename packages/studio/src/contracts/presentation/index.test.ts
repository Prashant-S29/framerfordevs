import { describe, expect, it } from "vitest";

import { decodeStudioPresentationResponse, decodeStudioPublishPresentationResponse } from "./index";

const collectionId = "11111111-1111-4111-8111-111111111111";
const fieldId = "33333333-3333-4333-8333-333333333333";
const presentation = {
  collectionId,
  revisionId: "22222222-2222-4222-8222-222222222222",
  sequence: 2,
  presentation: {
    displayName: "Articles",
    description: null,
    fields: [
      {
        fieldId,
        parentFieldId: null,
        kind: "short_text",
        displayLabel: "Title",
        position: 0,
        helpText: null,
        placeholder: null,
        enumOptions: [],
      },
    ],
    layout: {
      tabs: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          title: "Content",
          description: null,
          position: 0,
          groups: [
            {
              id: "55555555-5555-4555-8555-555555555555",
              title: "Main",
              description: null,
              position: 0,
              columns: 1,
              fields: [{ fieldId, position: 0, helpTextOverride: null }],
            },
          ],
        },
      ],
      sidebarGroups: [],
    },
  },
};

function success(data: unknown) {
  return { ok: true, data, error: null, message: "Loaded." };
}

describe("Studio presentation browser contract", () => {
  it("decodes the exact presentation and publish result", () => {
    expect(decodeStudioPresentationResponse(success(presentation), 200, collectionId)).toEqual(
      presentation,
    );
    expect(
      decodeStudioPublishPresentationResponse(
        success({ replayed: true, noOp: false, presentation }),
        200,
        collectionId,
      ),
    ).toEqual({ replayed: true, noOp: false, presentation });
  });

  it("rejects role lists, excess keys, and another collection", () => {
    const withRoles = {
      ...presentation,
      presentation: {
        ...presentation.presentation,
        fields: [{ ...presentation.presentation.fields[0], visibleToRoles: ["owner"] }],
      },
    };
    expect(() => decodeStudioPresentationResponse(success(withRoles), 200, collectionId)).toThrow();
    expect(() =>
      decodeStudioPresentationResponse(success({ ...presentation, extra: 1 }), 200, collectionId),
    ).toThrow();
    expect(() =>
      decodeStudioPresentationResponse(
        success(presentation),
        200,
        "66666666-6666-4666-8666-666666666666",
      ),
    ).toThrow();
  });

  it("returns typed presentation failures with their exact status", () => {
    const failure = {
      ok: false,
      data: null,
      error: {
        code: "PRESENTATION_SCOPE_RESTRICTED",
        message: "Restricted.",
        retryable: false,
        requestId: "request-1",
      },
      message: "Restricted.",
    };
    expect(decodeStudioPresentationResponse(failure, 403, collectionId)).toMatchObject({
      ok: false,
      error: { code: "PRESENTATION_SCOPE_RESTRICTED" },
    });
    expect(() => decodeStudioPresentationResponse(failure, 409, collectionId)).toThrow();
  });
});
