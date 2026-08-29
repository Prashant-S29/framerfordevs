// Configures API tests and coverage for contracts, Effect boundaries, and explicitly owned pure kernels.

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["test/setup.ts"],
    testTimeout: 10_000,
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    coverage: {
      include: [
        "src/contracts/**/*.ts",
        "src/lib/delivery/query/index.ts",
        "src/lib/entry/values/index.ts",
        "src/lib/network-source/index.ts",
        "src/lib/publication/snapshot/index.ts",
        "src/lib/entry/document-projection.ts",
        "src/lib/preview/document/index.ts",
        "src/lib/preview/query/index.ts",
        "src/observability/**/*.ts",
        "src/operations/**/*.ts",
        "src/services/**/*.ts",
        "src/runtime/index.ts",
      ],
      exclude: ["src/**/*.test.ts"],
    },
  },
});
