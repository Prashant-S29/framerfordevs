import { describe, expect, it } from "vitest";

import { booleanFlag, parseArguments, stringFlag, validateFlags } from "./command-arguments";

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

  it.each([
    ["duplicate", ["login", "--api", "https://one.example", "--api", "https://two.example"]],
    ["unknown", ["generate", "--allow-breaking"]],
    ["boolean value", ["generate", "--force", "yes"]],
    ["missing string", ["login", "--api"]],
  ])("rejects %s flag input", (_name, input) => {
    expect(() => validateFlags(parseArguments(input))).toThrowError("CLI_FLAG_INVALID");
  });
});
