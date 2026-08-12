// Configures API tests and coverage for contracts, Effect boundaries, and explicitly owned pure kernels.

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["test/setup.ts"],
    testTimeout: 10_000,
    include: ["src/**/*.test.ts"],
    coverage: {
      include: [
        "src/contracts/**/*.ts",
        "src/lib/delivery-query.ts",
        "src/lib/entry-values.ts",
        "src/lib/network-source.ts",
        "src/lib/publication-snapshot.ts",
        "src/lib/entry-document-projection.ts",
        "src/lib/preview-document.ts",
        "src/lib/preview-query.ts",
        "src/observability/**/*.ts",
        "src/operations/**/*.ts",
        "src/services/**/*.ts",
        "src/runtime.ts",
      ],
      exclude: ["src/**/*.test.ts"],
    },
  },
});
