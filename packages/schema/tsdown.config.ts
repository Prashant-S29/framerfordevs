import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "./src/index.ts",
    compose: "./src/compose.ts",
    validate: "./src/validate.ts",
  },
  format: "esm",
  outDir: "./dist",
  clean: true,
  dts: true,
  sourcemap: false,
});
