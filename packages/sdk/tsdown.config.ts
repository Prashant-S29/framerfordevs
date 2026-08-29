import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "./src/index",
    client: "./src/client/index",
    effect: "./src/effect/index",
    authoring: "./src/authoring/index",
    webhooks: "./src/webhooks/index",
    invalidation: "./src/invalidation",
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
