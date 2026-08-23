import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "./src/index.ts",
    client: "./src/client.ts",
    effect: "./src/effect.ts",
    webhooks: "./src/webhooks.ts",
    invalidation: "./src/invalidation.ts",
  },
  format: "esm",
  outDir: "./dist",
  clean: true,
  dts: true,
  sourcemap: false,
  deps: {
    neverBundle: ["effect"],
  },
});
