import { describe, expect, it } from "vitest";

import {
  editProjectFormSchema,
  localeFormSchema,
  projectFormSchema,
  projectKeyFromName,
  workspaceFormSchema,
} from "./index";

describe("platform form validation", () => {
  it.each(["Agency", "Client Workspace", "Café"])('accepts workspace name "%s"', (name) => {
    expect(workspaceFormSchema.safeParse({ name }).success).toBe(true);
  });

  it.each(["", "   ", "x".repeat(101), "unsafe\nname"])('rejects workspace name "%s"', (name) => {
    expect(workspaceFormSchema.safeParse({ name }).success).toBe(false);
  });

  it.each(["site", "site-2", "product-docs"])('accepts project key "%s"', (key) => {
    expect(
      projectFormSchema.safeParse({ name: "Project", key, description: "", enableCms: true })
        .success,
    ).toBe(true);
  });

  it.each(["Site", "-site", "site-", "site--docs", "site_docs", "x".repeat(64)])(
    'rejects project key "%s"',
    (key) => {
      expect(
        projectFormSchema.safeParse({ name: "Project", key, description: "", enableCms: true })
          .success,
      ).toBe(false);
    },
  );

  it("bounds project descriptions in create and edit forms", () => {
    const description = "x".repeat(501);

    expect(
      projectFormSchema.safeParse({
        name: "Project",
        key: "project",
        description,
        enableCms: true,
      }).success,
    ).toBe(false);
    expect(editProjectFormSchema.safeParse({ name: "Project", description }).success).toBe(false);
  });

  it.each([
    ["EN", "en"],
    ["en-us", "en-US"],
    ["zh-hant-tw", "zh-Hant-TW"],
    ["iw", "he"],
    ["de-1901", "de-1901"],
    ["i-klingon", "tlh"],
    ["zh-cmn-Hans", "cmn-Hans"],
  ])("canonicalizes valid locale tag %s", (tag, expected) => {
    const result = localeFormSchema.safeParse({ tag, displayName: "Language" });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.tag).toBe(expected);
  });

  it.each([
    "",
    "doekdoek",
    "oedll",
    "xlw",
    "en_US",
    "en--US",
    "de-DE-u-co-phonebk",
    "en-x-private",
    "qaa",
    "en-AA",
    "x".repeat(65),
  ])("rejects invalid or unsupported locale tag %s", (tag) => {
    expect(localeFormSchema.safeParse({ tag, displayName: "Language" }).success).toBe(false);
  });

  it("shows the pinned registry rejection reason", () => {
    const result = localeFormSchema.safeParse({ tag: "doekdoek", displayName: "Language" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "The language subtag is not registered in the IANA Language Subtag Registry.",
      );
    }
  });

  it("bounds and sanitizes locale display names", () => {
    expect(localeFormSchema.safeParse({ tag: "hi", displayName: "   " }).success).toBe(false);
    expect(localeFormSchema.safeParse({ tag: "hi", displayName: "x".repeat(101) }).success).toBe(
      false,
    );
    expect(localeFormSchema.safeParse({ tag: "hi", displayName: "Hin\ndi" }).success).toBe(false);
  });
});

describe("project key suggestion", () => {
  it.each([
    ["Marketing Site", "marketing-site"],
    ["  Café Website  ", "cafe-website"],
    ["Docs & API", "docs-api"],
    ["Already--Separated", "already-separated"],
    ["नमस्ते", ""],
  ])("normalizes %s", (name, expected) => {
    expect(projectKeyFromName(name)).toBe(expected);
  });

  it("never returns an oversized or trailing-hyphen key", () => {
    const key = projectKeyFromName(`${"project-".repeat(20)}tail`);

    expect(key.length).toBeLessThanOrEqual(63);
    expect(key.endsWith("-")).toBe(false);
  });
});
