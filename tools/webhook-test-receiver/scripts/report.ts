// Summarizes persisted webhook captures by safe fixed dimensions without printing event bodies or identities.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

interface CaptureSummary {
  readonly scenario: string;
  readonly status: number;
  readonly verification: string;
  readonly phase: string;
}

/** Narrows unknown JSON into the small body-free shape needed by the report. */
function captureSummary(value: unknown): CaptureSummary | null {
  if (typeof value !== "object" || value === null) return null;
  if (!("scenario" in value) || typeof value.scenario !== "string") return null;
  if (!("phase" in value) || typeof value.phase !== "string") return null;
  if (!("response" in value) || typeof value.response !== "object" || value.response === null)
    return null;
  if (!("status" in value.response) || typeof value.response.status !== "number") return null;
  if (
    !("verification" in value) ||
    typeof value.verification !== "object" ||
    value.verification === null ||
    !("category" in value.verification) ||
    typeof value.verification.category !== "string"
  ) {
    return null;
  }
  return {
    scenario: value.scenario,
    status: value.response.status,
    verification: value.verification.category,
    phase: value.phase,
  };
}

/** Walks one directory recursively and returns only capture JSON paths. */
async function captureFiles(directory: string): Promise<ReadonlyArray<string>> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (cause) {
    if (typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT") {
      return [];
    }
    throw cause;
  }
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return captureFiles(path);
      return entry.isFile() && entry.name.endsWith(".json") ? [path] : [];
    }),
  );
  return nested.flat();
}

/** Increments one closed summary key without retaining request identity. */
function increment(summary: Record<string, number>, key: string): void {
  summary[key] = (summary[key] ?? 0) + 1;
}

/** Reads all captures and prints aggregate scenario/status/verification evidence only. */
async function main(): Promise<void> {
  const dataDirectory = process.env.DATA_DIR ?? "./data";
  const files = await captureFiles(join(dataDirectory, "captures"));
  const byScenario: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byVerification: Record<string, number> = {};
  const byPhase: Record<string, number> = {};
  for (const path of files) {
    const capture = captureSummary(JSON.parse(await readFile(path, "utf8")));
    if (capture === null) throw new Error("A persisted capture has an invalid report shape.");
    increment(byScenario, capture.scenario);
    increment(byStatus, String(capture.status));
    increment(byVerification, capture.verification);
    increment(byPhase, capture.phase);
  }
  process.stdout.write(
    `${JSON.stringify({ total: files.length, byScenario, byStatus, byVerification, byPhase }, null, 2)}\n`,
  );
}

await main();
