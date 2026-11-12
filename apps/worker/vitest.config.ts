// Keeps compiled build output out of test discovery; Vitest 5 no longer excludes dist by default.

import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "**/dist/**"],
  },
});
