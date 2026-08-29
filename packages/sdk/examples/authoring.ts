import { authoringV1 } from "@framerfordevs/sdk/authoring";

function requiredEnvironment(name: string) {
  const value = process.env[name];
  if (value === undefined) throw new Error(`Missing ${name}.`);
  return value;
}

export async function renameFirstArticle() {
  const client = authoringV1({
    baseUrl: requiredEnvironment("FFD_API_URL"),
    projectId: requiredEnvironment("FFD_PROJECT_ID"),
    environmentId: requiredEnvironment("FFD_ENVIRONMENT_ID"),
    token: requiredEnvironment("FFD_MANAGEMENT_TOKEN"),
  });
  const page = await client.entries.list("articles", "en-US", { limit: 20 });
  if (!page.body?.ok) return page;
  const entry = page.body.data.items[0];
  if (entry === undefined) return page;
  return client.entries.rename("articles", "en-US", entry.id, {
    displayName: "Launch article",
    expectedNameVersion: entry.nameVersion,
  });
}
