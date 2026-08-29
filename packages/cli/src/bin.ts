#!/usr/bin/env node

const rawArguments = process.argv.slice(2);

async function main() {
  if (rawArguments[0] === "schema" && rawArguments[1] === "build") {
    const { runSchemaBuildCli } = await import("./schema/build/bin.js");
    await runSchemaBuildCli(rawArguments);
    return;
  }
  if (
    rawArguments[0] === "schema" &&
    (rawArguments[1] === "export" || rawArguments[1] === "plan" || rawArguments[1] === "push")
  ) {
    const { runSchemaAuthoringCli } = await import("./schema/authoring/bin.js");
    await runSchemaAuthoringCli(rawArguments);
    return;
  }
  if (rawArguments[0] === "entry") {
    const { runContentCli } = await import("./content/bin/index.js");
    await runContentCli(rawArguments);
    return;
  }
  if (rawArguments[0] === "editor") {
    const { runEditorCli } = await import("./editor/bin/index.js");
    await runEditorCli(rawArguments);
    return;
  }
  const { runAuthenticatedCli } = await import("./authenticated-bin.js");
  await runAuthenticatedCli(rawArguments);
}

void main().catch(() => {
  process.stderr.write("The command failed unexpectedly.\n");
  process.exitCode = 1;
});
