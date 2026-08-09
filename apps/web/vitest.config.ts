// Configures web component/lib tests and measured coverage for authoring interaction boundaries.

import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      include: [
        "src/components/generated-form.tsx",
        "src/components/locale-tabs.tsx",
        "src/components/portable-text-field.tsx",
        "src/lib/auth-navigation.ts",
        "src/lib/entry-defaults.ts",
        "src/lib/platform-validation.ts",
        "src/lib/server-url.ts",
      ],
    },
  },
});
