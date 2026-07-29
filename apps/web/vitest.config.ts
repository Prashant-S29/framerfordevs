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
        "src/lib/auth-navigation.ts",
        "src/lib/platform-validation.ts",
        "src/lib/server-url.ts",
      ],
    },
  },
});
