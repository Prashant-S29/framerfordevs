import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "./src/index",
    generator: "./src/generator/index",
    "schema-extractor": "./src/schema/extractor",
    "experimental-schema-build": "./src/experimental-schema-build",
    "experimental-schema-build-worker": "./src/schema/experimental-build/worker",
    "static-schema-extractor-worker": "./src/schema/static-extractor/worker",
    bin: "./src/bin",
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
