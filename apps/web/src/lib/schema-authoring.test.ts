import { describe, expect, it } from "vitest";

import {
  applicationErrorDetails,
  authoringDocument,
  createSchemaField,
  inferAuthoringDocument,
  normalizeEditorFieldTree,
  parseAuthoringDocument,
  siblingApiKeyConflict,
  stringifyAuthoringDocument,
  validateEditorFields,
} from "./schema-authoring";

const collectionId = "019fae8b-1234-7000-8000-000000000004";

describe("schema authoring", () => {
  it("round-trips the bounded versioned schema document", () => {
    const field = createSchemaField({
      kind: "money",
      collectionId,
      suggestedLabel: "Price",
      suggestedKey: "price",
    });
    const source = stringifyAuthoringDocument([field]);
    const parsed = parseAuthoringDocument(source);

    expect(parsed.valid).toBe(true);
    expect(parsed.fields[0]?.kind).toBe("money");
    expect(parsed.fields[0]?.configuration).toEqual({ currencies: ["USD"] });
    expect(authoringDocument(parsed.fields).version).toBe(1);
  });

  it("reports duplicate sibling keys while allowing duplicate labels", () => {
    const first = createSchemaField({
      kind: "short_text",
      collectionId,
      suggestedLabel: "Title",
      suggestedKey: "title",
    });
    const second = createSchemaField({
      kind: "long_text",
      collectionId,
      suggestedLabel: "Title",
      suggestedKey: "title",
    });
    const fields = [first, second];

    expect(siblingApiKeyConflict(fields, second.localId, "title")).toBe(true);
    expect(validateEditorFields(fields)).toEqual([
      expect.objectContaining({ code: "field_key_duplicate", path: "fields.1.apiKey" }),
    ]);
  });

  it("normalizes inherited localization and list-item editor metadata", () => {
    const list = createSchemaField({
      kind: "list",
      collectionId,
      suggestedLabel: "Tags",
      suggestedKey: "tags",
    });
    const item = createSchemaField({ kind: "short_text", collectionId, parent: list });
    const normalized = normalizeEditorFieldTree({
      ...list,
      editor: { ...list.editor, helpText: "Shared item help" },
      children: [{ ...item, localization: "localized" }],
    });

    expect(normalized.children[0]?.localization).toBeNull();
    expect(normalized.children[0]?.required).toBeNull();
    expect(normalized.children[0]?.editor.helpText).toBe("Shared item help");
  });

  it("infers nested fields without retaining sample values", () => {
    const inferred = inferAuthoringDocument(
      JSON.stringify({
        title: "Hello",
        price: 12.5,
        details: { featured: true },
        tags: ["news"],
      }),
      collectionId,
    );

    expect(inferred.valid).toBe(true);
    expect(inferred.fields.map((field) => field.kind)).toEqual([
      "short_text",
      "number",
      "object",
      "list",
    ]);
    expect(inferred.fields[1]?.configuration).toEqual({ mode: "floating_point" });
    expect(JSON.stringify(authoringDocument(inferred.fields))).not.toContain("Hello");
    expect(JSON.stringify(authoringDocument(inferred.fields))).not.toContain("news");
  });

  it("returns precise nested application error details", () => {
    const details = applicationErrorDetails({
      data: {
        error: {
          details: [
            {
              path: "fields.1.apiKey",
              code: "field_key_duplicate",
              message: "Sibling field API keys must be unique.",
            },
          ],
        },
      },
    });

    expect(details).toEqual([
      {
        path: "fields.1.apiKey",
        code: "field_key_duplicate",
        message: "Sibling field API keys must be unique.",
      },
    ]);
  });

  it("rejects malformed and oversized schema JSON before application", () => {
    expect(parseAuthoringDocument("{").issues[0]?.code).toBe("json_parse_failed");
    expect(parseAuthoringDocument(`"${"x".repeat(1_048_577)}"`).issues[0]?.code).toBe(
      "document_size_exceeded",
    );
  });
});
