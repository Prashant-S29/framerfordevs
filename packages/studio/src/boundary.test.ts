import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const browserSources = [
  new URL("./app/index.tsx", import.meta.url),
  new URL("./app/shell.tsx", import.meta.url),
  new URL("./contracts/index.ts", import.meta.url),
];

describe("Studio browser package boundary", () => {
  it("does not import server, auth, environment, database, token, or store modules", async () => {
    const source = (await Promise.all(browserSources.map((url) => readFile(url, "utf8")))).join(
      "\n",
    );
    for (const forbidden of [
      "@framerfordevs/studio-server",
      "@framerfordevs/auth",
      "@framerfordevs/env",
      "@framerfordevs/db",
      "@framerfordevs/api",
      "@framerfordevs/studio-oauth-harness",
      "better-auth",
      "node:",
      "localStorage",
      "sessionStorage",
      "refresh_token",
      "access_token",
      "client_secret",
    ])
      expect(source).not.toContain(forbidden);
  });
});
