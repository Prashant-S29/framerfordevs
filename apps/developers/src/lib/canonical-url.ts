// Builds canonical public documentation URLs from the exact configured developer origin.

import { env } from "@framerfordevs/env/developers";

export function canonicalDeveloperUrl(pathname: string) {
  return new URL(pathname, env.VITE_DEVELOPER_ORIGIN).toString();
}
