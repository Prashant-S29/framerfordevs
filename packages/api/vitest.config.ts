// Configures API tests and coverage for contracts, Effect boundaries, and explicitly owned pure kernels.

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["test/setup.ts"],
    include: ["src/**/*.test.ts"],
    coverage: {
      include: [
        "src/contracts/**/*.ts",
        "src/lib/entry-values.ts",
        "src/lib/publication-snapshot.ts",
        "src/observability/**/*.ts",
        "src/operations/**/*.ts",
        "src/services/**/*.ts",
        "src/runtime.ts",
      ],
      exclude: ["src/**/*.test.ts"],
    },
  },
});
