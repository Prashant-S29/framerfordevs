// Builds the self-hosted MDX portal and emits only baseline-verified public contract artifacts.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { publicContractMetadata } from "@framerfordevs/public-contracts/metadata";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { fumadocsMdx } from "fumadocs-mdx/vite";
import { nitro } from "nitro/vite";
import { defineConfig, type Plugin } from "vite";

/** Emits registry artifacts only after their source bytes match immutable baselines. */
function publicContractArtifacts(): Plugin {
  return {
    name: "public-contract-artifacts",
    apply: "build" as const,
    async buildStart() {
      for (const entry of Object.values(publicContractMetadata)) {
        const sourcePath = fileURLToPath(
          new URL(`../../packages/public-contracts/${entry.outputPath}`, import.meta.url),
        );
        const source = await readFile(sourcePath);
        const digest = createHash("sha256").update(source).digest("hex");
        if (digest !== entry.baselineDigest) {
          throw new Error(`Public contract baseline mismatch for ${entry.family}/${entry.major}.`);
        }
        this.emitFile({
          type: "asset",
          fileName: `specs/${entry.family}/${entry.major}/${
            entry.kind === "openapi" ? "openapi.json" : "events.schema.json"
          }`,
          source,
        });
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  server: { port: 3002 },
  resolve: {
    tsconfigPaths: true,
  },
  plugins:
    mode === "test"
      ? [fumadocsMdx(), tailwindcss(), viteReact()]
      : [
          fumadocsMdx(),
          tailwindcss(),
          publicContractArtifacts(),
          tanstackStart({
            pages: [
              { path: "/api/search" },
              { path: "/api-reference" },
              { path: "/api-reference/authoring/v1" },
              { path: "/api-reference/control-plane/v1" },
              { path: "/api-reference/delivery/v1" },
              { path: "/api-reference/preview/v1" },
              { path: "/api-reference/tooling/v1" },
              { path: "/api-reference/webhooks/v1" },
            ],
            prerender: {
              enabled: true,
              crawlLinks: true,
            },
          }),
          viteReact(),
          nitro({
            routeRules: {
              "/**": {
                headers: {
                  "content-security-policy":
                    "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'none'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
                  "permissions-policy": "camera=(), geolocation=(), microphone=(), payment=()",
                  "referrer-policy": "no-referrer",
                  "x-content-type-options": "nosniff",
                  "x-frame-options": "DENY",
                },
              },
            },
          }),
        ],
}));
