// Validates public dashboard service and cross-surface navigation origins.

import { createEnv } from "@t3-oss/env-core";

import { exactOriginSchema } from "../origin";

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_DASHBOARD_ORIGIN: exactOriginSchema,
    VITE_DEVELOPER_ORIGIN: exactOriginSchema,
    VITE_MARKETING_ORIGIN: exactOriginSchema,
  },
  runtimeEnv: import.meta.env,
  skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
  emptyStringAsUndefined: true,
});
