import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "./src/index.ts",
    generator: "./src/generator.ts",
    bin: "./src/bin.ts",
  },
  format: "esm",
  outDir: "./dist",
  clean: true,
  dts: true,
  sourcemap: false,
  deps: {
    neverBundle: ["effect", "@framerfordevs/sdk"],
  },
});
