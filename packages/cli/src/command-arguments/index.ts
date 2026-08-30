export interface ParsedArguments {
  readonly command: ReadonlyArray<string>;
  readonly flags: ReadonlyMap<string, string | true | ReadonlyArray<string>>;
}

export function parseArguments(arguments_: ReadonlyArray<string>): ParsedArguments {
  const command: Array<string> = [];
  const flags = new Map<string, string | true | ReadonlyArray<string>>();
  for (let index = 0; index < arguments_.length; index += 1) {
    const value = arguments_[index];
    if (value === undefined) continue;
    if (!value.startsWith("--")) {
      command.push(value);
      continue;
    }
    const name = value.slice(2);
    if (name.length === 0) throw new Error("CLI_FLAG_INVALID");
    const next = arguments_[index + 1];
    const parsedValue = next !== undefined && !next.startsWith("--") ? next : true;
    if (parsedValue !== true) index += 1;
    const existing = flags.get(name);
    if (existing === undefined) {
      flags.set(name, parsedValue);
    } else if (
      name === "acknowledge" &&
      typeof existing === "string" &&
      typeof parsedValue === "string"
    ) {
      flags.set(name, [existing, parsedValue]);
    } else if (
      name === "acknowledge" &&
      Array.isArray(existing) &&
      typeof parsedValue === "string"
    ) {
      flags.set(name, [...existing, parsedValue]);
    } else {
      throw new Error("CLI_FLAG_INVALID");
    }
  }
  return { command, flags };
}

export function stringFlag(arguments_: ParsedArguments, name: string): string | undefined {
  const value = arguments_.flags.get(name);
  return typeof value === "string" ? value : undefined;
}

export function stringFlags(arguments_: ParsedArguments, name: string): ReadonlyArray<string> {
  const value = arguments_.flags.get(name);
  if (typeof value === "string") return [value];
  return Array.isArray(value) ? value : [];
}

export function booleanFlag(arguments_: ParsedArguments, name: string): boolean {
  return arguments_.flags.get(name) === true;
}

export function validateFlags(arguments_: ParsedArguments): void {
  const command = arguments_.command.join(" ");
  const allowed: Readonly<
    Record<string, Readonly<Record<string, "boolean" | "string" | "strings">>>
  > = {
    "": { json: "boolean" },
    help: { json: "boolean" },
    login: { api: "string", open: "boolean", json: "boolean" },
    logout: { api: "string", json: "boolean" },
    whoami: { api: "string", json: "boolean" },
    link: {
      api: "string",
      project: "string",
      environment: "string",
      output: "string",
      schema: "string",
      json: "boolean",
    },
    "schema pull": { json: "boolean" },
    "schema build": { check: "boolean", json: "boolean" },
    "schema export": { json: "boolean" },
    "schema plan": { json: "boolean" },
    "schema push": { acknowledge: "strings", json: "boolean" },
    "schema check": { "allow-metadata-only": "boolean", json: "boolean" },
    "presentation get": { collection: "string", json: "boolean" },
    "presentation publish": { collection: "string", file: "string", json: "boolean" },
    "entry list": { collection: "string", locale: "string", json: "boolean" },
    "entry get": { collection: "string", entry: "string", locale: "string", json: "boolean" },
    "entry create": {
      collection: "string",
      locale: "string",
      name: "string",
      mutations: "string",
      json: "boolean",
    },
    "entry update": {
      collection: "string",
      entry: "string",
      locale: "string",
      mutations: "string",
      json: "boolean",
    },
    "entry publish": {
      collection: "string",
      entry: "string",
      locale: "string",
      json: "boolean",
    },
    "entry unpublish": {
      collection: "string",
      entry: "string",
      locale: "string",
      json: "boolean",
    },
    editor: { "token-stdin": "boolean" },
    generate: { offline: "boolean", force: "boolean", json: "boolean" },
  };
  const commandFlags = allowed[command];
  if (commandFlags === undefined) return;
  for (const [name, value] of arguments_.flags) {
    const kind = commandFlags[name];
    const valid =
      kind !== undefined &&
      ((kind === "boolean" && value === true) ||
        (kind === "string" && typeof value === "string") ||
        (kind === "strings" &&
          (typeof value === "string" ||
            (Array.isArray(value) &&
              value.length > 0 &&
              value.every((item) => typeof item === "string")))));
    if (!valid) throw new Error("CLI_FLAG_INVALID");
  }
}
