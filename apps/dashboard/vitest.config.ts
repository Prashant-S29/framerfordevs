// Configures dashboard component/lib tests and measured coverage for authoring interaction boundaries.

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
    env: {
      VITE_DASHBOARD_ORIGIN: "http://localhost:3001",
      VITE_DEVELOPER_ORIGIN: "http://localhost:3002",
      VITE_MARKETING_ORIGIN: "http://localhost:3003",
    },
    include: ["src/**/*.test.{ts,tsx}", "test/**/*.test.{ts,tsx}"],
    coverage: {
      include: [
        "src/components/entry/preview/index.tsx",
        "src/components/entry/form/index.tsx",
        "src/components/entry/locale-tabs.tsx",
        "src/components/entry/portable-text-field/index.tsx",
        "src/lib/auth/navigation/index.ts",
        "src/lib/entry/defaults/index.ts",
        "src/lib/validation/platform/index.ts",
        "src/lib/server-url/index.ts",
      ],
    },
  },
});
