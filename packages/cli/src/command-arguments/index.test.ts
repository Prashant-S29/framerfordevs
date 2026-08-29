import { describe, expect, it } from "vitest";

import { booleanFlag, parseArguments, stringFlag, stringFlags, validateFlags } from "./index";

describe("CLI command arguments", () => {
  it("parses strict string and boolean flags without evaluating project code", () => {
    const parsed = parseArguments([
      "link",
      "--api",
      "https://api.example.com",
      "--project",
      "project-id",
      "--environment",
      "main",
      "--json",
    ]);
    validateFlags(parsed);

    expect(parsed.command).toEqual(["link"]);
    expect(stringFlag(parsed, "api")).toBe("https://api.example.com");
    expect(booleanFlag(parsed, "json")).toBe(true);
  });

  it("accepts the explicit schema build and plan contracts", () => {
    const build = parseArguments(["schema", "build", "--check", "--json"]);
    const plan = parseArguments(["schema", "plan", "--json"]);
    validateFlags(build);
    validateFlags(plan);

    expect(build.command).toEqual(["schema", "build"]);
    expect(booleanFlag(build, "check")).toBe(true);
    expect(booleanFlag(build, "json")).toBe(true);
    expect(plan.command).toEqual(["schema", "plan"]);
    expect(booleanFlag(plan, "json")).toBe(true);
    expect(() => validateFlags(parseArguments(["schema", "plan", "--api", "x"]))).toThrowError(
      "CLI_FLAG_INVALID",
    );

    const push = parseArguments([
      "schema",
      "push",
      "--acknowledge",
      "a".repeat(64),
      "--acknowledge",
      "b".repeat(64),
      "--json",
    ]);
    validateFlags(push);
    expect(stringFlags(push, "acknowledge")).toEqual(["a".repeat(64), "b".repeat(64)]);

    const create = parseArguments([
      "entry",
      "create",
      "--collection",
      "posts",
      "--locale",
      "en-US",
      "--name",
      "Post",
      "--mutations",
      "mutations.json",
      "--json",
    ]);
    validateFlags(create);
    expect(create.command).toEqual(["entry", "create"]);
    expect(stringFlag(create, "mutations")).toBe("mutations.json");

    const editor = parseArguments(["editor"]);
    validateFlags(editor);
    validateFlags(parseArguments(["editor", "--token-stdin"]));
    expect(editor.command).toEqual(["editor"]);
    expect(() => validateFlags(parseArguments(["editor", "--api", "x"]))).toThrowError(
      "CLI_FLAG_INVALID",
    );
  });

  it.each([
    ["duplicate", ["login", "--api", "https://one.example", "--api", "https://two.example"]],
    ["unknown", ["generate", "--allow-breaking"]],
    ["boolean value", ["generate", "--force", "yes"]],
    ["missing string", ["login", "--api"]],
  ])("rejects %s flag input", (_name, input) => {
    expect(() => validateFlags(parseArguments(input))).toThrowError("CLI_FLAG_INVALID");
  });
});
