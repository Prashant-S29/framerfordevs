// Defines the exact origin-only configuration schema shared by browser and server environments.

import { z } from "zod";

export const exactOriginSchema = z.url().transform((value, context) => {
  const url = new URL(value);
  if (
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== "" ||
    url.username !== "" ||
    url.password !== ""
  ) {
    context.addIssue({
      code: "custom",
      message: "Expected an origin without credentials, path, query, or fragment.",
    });
    return z.NEVER;
  }
  return url.origin;
});
