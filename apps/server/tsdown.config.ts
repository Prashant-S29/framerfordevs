import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "./src/index",
  format: "esm",
  outDir: "./dist",
  clean: true,
  outputOptions: {
    comments: { legal: true, annotation: true, jsdoc: false },
  },
  deps: {
    alwaysBundle: [/@framerfordevs\/.*/],
    onlyBundle: false,
  },
});
