// Projects internal contract values into the recursively exact public Tooling JSON boundary.

/** Maps JavaScript-only undefined to canonical null without changing internal hash semantics. */
export function toolingJsonData(value: unknown): unknown {
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.map(toolingJsonData);
  if (typeof value !== "object" || value === null) return value;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value)) output[key] = toolingJsonData(Reflect.get(value, key));
  return output;
}
