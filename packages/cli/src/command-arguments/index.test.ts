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

    const presentationGet = parseArguments([
      "presentation",
      "get",
      "--collection",
      "posts",
      "--json",
    ]);
    const presentationPublish = parseArguments([
      "presentation",
      "publish",
      "--collection",
      "posts",
      "--file",
      "presentation.json",
      "--json",
    ]);
    validateFlags(presentationGet);
    validateFlags(presentationPublish);
    expect(stringFlag(presentationPublish, "file")).toBe("presentation.json");
    expect(() =>
      validateFlags(parseArguments(["presentation", "publish", "--schema", "x"])),
    ).toThrowError("CLI_FLAG_INVALID");

    const editor = parseArguments(["editor"]);
    validateFlags(editor);
    validateFlags(parseArguments(["editor", "--token-stdin"]));
    expect(editor.command).toEqual(["editor"]);
    expect(() => validateFlags(parseArguments(["editor", "--api", "x"]))).toThrowError(
      "CLI_FLAG_INVALID",
    );
  });

  it("accepts only the explicit Control Plane automation flags", () => {
    const create = parseArguments([
      "project",
      "create",
      "--api",
      "https://api.example.com",
      "--workspace",
      "workspace-id",
      "--name",
      "Project",
      "--key",
      "project",
      "--enable-cms",
      "--command-id",
      "019fae8b-1234-7000-8000-000000000001",
      "--json",
    ]);
    validateFlags(create);
    expect(create.command).toEqual(["project", "create"]);
    expect(booleanFlag(create, "enable-cms")).toBe(true);
    expect(stringFlag(create, "api")).toBe("https://api.example.com");

    expect(() => validateFlags(parseArguments(["project", "restore", "--force"]))).toThrowError(
      "CLI_FLAG_INVALID",
    );
    expect(() => validateFlags(parseArguments(["workspace", "list", "--offline"]))).toThrowError(
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
