export interface ParsedArguments {
  readonly command: ReadonlyArray<string>;
  readonly flags: ReadonlyMap<string, string | true>;
}

export function parseArguments(arguments_: ReadonlyArray<string>): ParsedArguments {
  const command: Array<string> = [];
  const flags = new Map<string, string | true>();
  for (let index = 0; index < arguments_.length; index += 1) {
    const value = arguments_[index];
    if (value === undefined) continue;
    if (!value.startsWith("--")) {
      command.push(value);
      continue;
    }
    const name = value.slice(2);
    if (name.length === 0 || flags.has(name)) throw new Error("CLI_FLAG_INVALID");
    const next = arguments_[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags.set(name, next);
      index += 1;
    } else {
      flags.set(name, true);
    }
  }
  return { command, flags };
}

export function stringFlag(arguments_: ParsedArguments, name: string): string | undefined {
  const value = arguments_.flags.get(name);
  return typeof value === "string" ? value : undefined;
}

export function booleanFlag(arguments_: ParsedArguments, name: string): boolean {
  return arguments_.flags.get(name) === true;
}

export function validateFlags(arguments_: ParsedArguments): void {
  const command = arguments_.command.join(" ");
  const allowed: Readonly<Record<string, Readonly<Record<string, "boolean" | "string">>>> = {
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
      json: "boolean",
    },
    "schema pull": { json: "boolean" },
    "schema check": { "allow-metadata-only": "boolean", json: "boolean" },
    generate: { offline: "boolean", force: "boolean", json: "boolean" },
  };
  const commandFlags = allowed[command];
  if (commandFlags === undefined) return;
  for (const [name, value] of arguments_.flags) {
    const kind = commandFlags[name];
    if (kind === undefined || (kind === "boolean") !== (value === true)) {
      throw new Error("CLI_FLAG_INVALID");
    }
  }
}
