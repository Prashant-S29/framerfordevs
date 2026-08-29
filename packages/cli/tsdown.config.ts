import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "./src/index.ts",
    generator: "./src/generator.ts",
    "schema-extractor": "./src/schema-extractor.ts",
    "experimental-schema-build": "./src/experimental-schema-build.ts",
    "experimental-schema-build-worker": "./src/experimental-schema-build-worker.ts",
    "static-schema-extractor-worker": "./src/static-schema-extractor-worker.ts",
    bin: "./src/bin.ts",
  },
  format: "esm",
  outDir: "./dist",
  clean: true,
  dts: true,
  sourcemap: false,
  deps: {
    neverBundle: [
      "effect",
      "typescript",
      "quickjs-emscripten-core",
      "@jitl/quickjs-wasmfile-release-sync",
      "@framerfordevs/sdk",
      "@framerfordevs/schema",
    ],
  },
});
