import { findKnowledgeBaseViolations } from "../../scripts/check/knowledge-base.mjs";

async function readPayload() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

const payload = await readPayload();
const filePath = String(payload?.tool_input?.file_path ?? payload?.tool_input?.path ?? "");
if (/(^|[\\/])knowledge_base[\\/]/u.test(filePath)) {
  const violations = await findKnowledgeBaseViolations();
  if (violations.length > 0) {
    process.stderr.write(
      `The knowledge-base edit breaks .claude/rules/knowledge-base.md:\n${violations.map((v) => `- ${v}`).join("\n")}\n`,
    );
    process.exit(2);
  }
}
