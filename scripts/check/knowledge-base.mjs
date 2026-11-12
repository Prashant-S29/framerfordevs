import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const base = join(root, "knowledge_base");

export const budgets = {
  "context.md": 4_000,
  "progress.md": 6_000,
  "milestone.md": 16_000,
  "product.md": 11_000,
  "prd/cms.md": 31_000,
};

const maxLineLength = 600;
const stateDocuments = new Set(["context.md", "progress.md", "milestone.md"]);

async function listFiles(directory) {
  const out = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(path)));
    else out.push(relative(base, path).split(sep).join("/"));
  }
  return out;
}

export async function findKnowledgeBaseViolations() {
  const violations = [];
  const files = await listFiles(base);
  for (const file of files) {
    if (!(file in budgets)) {
      violations.push(
        `${file}: not an approved knowledge-base document. Allowed: ${Object.keys(budgets).join(", ")}. Put rules in .claude/rules/, rationale in code comments or tests, and history in git.`,
      );
    }
  }
  for (const [file, budget] of Object.entries(budgets)) {
    const path = join(base, file);
    let text;
    try {
      text = await readFile(path, "utf8");
    } catch {
      violations.push(`${file}: required document is missing.`);
      continue;
    }
    const size = (await stat(path)).size;
    if (size > budget) {
      violations.push(
        `${file}: ${size} bytes exceeds the ${budget}-byte budget. Replace or compress stale content instead of appending.`,
      );
    }
    text.split("\n").forEach((line, index) => {
      if (line.length > maxLineLength) {
        violations.push(
          `${file}:${index + 1}: line has ${line.length} characters (limit ${maxLineLength}). Split it or remove evidence detail.`,
        );
      }
      if (/knowledge_base\/(decisions|proposals|rules)\/|learnings\.md/u.test(line)) {
        violations.push(`${file}:${index + 1}: references a removed knowledge-base location.`);
      }
      if (stateDocuments.has(file) && /\b[0-9a-f]{64}\b/u.test(line)) {
        violations.push(
          `${file}:${index + 1}: contains a 64-character hash. Evidence belongs in tests, artifacts, or commit messages.`,
        );
      }
      if (stateDocuments.has(file) && /^#{1,6} .*\b20\d\d-\d\d-\d\d\b/u.test(line)) {
        violations.push(
          `${file}:${index + 1}: dated heading. State documents hold current facts, not a log.`,
        );
      }
    });
    if (file === "context.md") {
      const section = text.split(/^## Current work and next gate$/mu)[1];
      const blocks = section?.split(/^## /mu)[0].match(/^- \*\*(Current|Next)\b/gmu) ?? [];
      if (blocks.length !== 2 || !blocks[0]?.includes("Current") || !blocks[1]?.includes("Next")) {
        violations.push(
          "context.md: `## Current work and next gate` must contain exactly one `Current` bullet followed by one `Next` bullet.",
        );
      }
    }
  }
  return violations;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const violations = await findKnowledgeBaseViolations();
  if (violations.length > 0) {
    console.error(`Knowledge base violations:\n${violations.map((v) => `- ${v}`).join("\n")}`);
    process.exit(1);
  }
  console.log("Knowledge base within budget.");
}
