import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["test/setup.ts"],
    include: ["src/**/*.test.ts"],
    coverage: {
      include: [
        "src/contracts/**/*.ts",
        "src/observability/**/*.ts",
        "src/operations/**/*.ts",
        "src/services/**/*.ts",
        "src/runtime.ts",
      ],
      exclude: ["src/**/*.test.ts"],
    },
  },
});
