import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "./src/core/index",
    compose: "./src/compose",
    validate: "./src/validate/index",
  },
  format: "esm",
  outDir: "./dist",
  clean: true,
  dts: true,
  sourcemap: false,
});
