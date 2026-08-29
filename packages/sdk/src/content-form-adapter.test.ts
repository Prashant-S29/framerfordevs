// Proves the strictly decoded Authoring DTO is accepted by the private renderer adapter.

import { adaptAuthoringGeneratedForm } from "@framerfordevs/content-form/authoring-adapter";
import { describe, expect, it } from "vitest";

import type { AuthoringGeneratedForm } from "./authoring-form";

const adaptDecodedAuthoringForm = (definition: AuthoringGeneratedForm) =>
  adaptAuthoringGeneratedForm(definition);

describe("content-form Authoring adapter", () => {
  it("accepts the exact recursive SDK DTO without assertions", () => {
    expect(typeof adaptDecodedAuthoringForm).toBe("function");
  });
});
