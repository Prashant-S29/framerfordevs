import { describe, expect, it } from "vitest";

import {
  editProjectFormSchema,
  projectFormSchema,
  projectKeyFromName,
  workspaceFormSchema,
} from "./platform-validation";

describe("platform form validation", () => {
  it.each(["Agency", "Client Workspace", "Café"])('accepts workspace name "%s"', (name) => {
    expect(workspaceFormSchema.safeParse({ name }).success).toBe(true);
  });

  it.each(["", "   ", "x".repeat(101), "unsafe\nname"])('rejects workspace name "%s"', (name) => {
    expect(workspaceFormSchema.safeParse({ name }).success).toBe(false);
  });

  it.each(["site", "site-2", "product-docs"])('accepts project key "%s"', (key) => {
    expect(projectFormSchema.safeParse({ name: "Project", key, description: "" }).success).toBe(
      true,
    );
  });

  it.each(["Site", "-site", "site-", "site--docs", "site_docs", "x".repeat(64)])(
    'rejects project key "%s"',
    (key) => {
      expect(projectFormSchema.safeParse({ name: "Project", key, description: "" }).success).toBe(
        false,
      );
    },
  );

  it("bounds project descriptions in create and edit forms", () => {
    const description = "x".repeat(501);

    expect(
      projectFormSchema.safeParse({ name: "Project", key: "project", description }).success,
    ).toBe(false);
    expect(editProjectFormSchema.safeParse({ name: "Project", description }).success).toBe(false);
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
