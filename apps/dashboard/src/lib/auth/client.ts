import {
  oauthDeviceAuthorizationClient,
  oauthProviderClient,
} from "@better-auth/oauth-provider/client";
import { env } from "@framerfordevs/env/dashboard";
import type { BetterAuthClientPlugin } from "better-auth";
import { createAuthClient } from "better-auth/react";

import { getServerUrl } from "../server-url";

const initialSignedOAuthQuery = (() => {
  if (typeof window === "undefined" || window.location.search.length > 16_385) return undefined;
  const params = new URLSearchParams(window.location.search);
  const signature = params.get("sig");
  let signedNames = params.getAll("ba_param");
  if (signedNames.length === 1 && signedNames[0]?.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(signedNames[0]);
      if (
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        parsed.length <= 64 &&
        parsed.every((value) => typeof value === "string")
      ) {
        signedNames = parsed;
      }
    } catch {
      return undefined;
    }
  }
  if (signature === null || signedNames.length === 0) return undefined;
  const signedNameSet = new Set(signedNames);
  const signed = new URLSearchParams();
  for (const [key, value] of params.entries()) {
    if (key !== "ba_param" && key !== "sig" && signedNameSet.has(key)) {
      signed.append(key, value);
    }
  }
  for (const name of signedNames) signed.append("ba_param", name);
  signed.set("sig", signature);
  return signed.toString();
})();

const preserveInitialOAuthQuery = () =>
  ({
    id: "preserve-initial-oauth-query",
    fetchPlugins: [
      {
        id: "preserve-initial-oauth-query-request",
        name: "preserve-initial-oauth-query-request",
        hooks: {
          onRequest(context) {
            if (
              initialSignedOAuthQuery === undefined ||
              context.method === "GET" ||
              context.method === "DELETE"
            ) {
              return;
            }
            let body: unknown = context.body;
            if (typeof body === "string") {
              try {
                body = JSON.parse(body);
              } catch {
                return;
              }
            }
            if (typeof body !== "object" || body === null || Array.isArray(body)) return;
            if (Reflect.has(body, "oauth_query")) return;
            context.body = JSON.stringify({ ...body, oauth_query: initialSignedOAuthQuery });
          },
        },
      },
    ],
    $InferServerPlugin: {},
  }) satisfies BetterAuthClientPlugin;

export const authClient = createAuthClient({
  // better-auth derives its route-matching base from this URL's path, so the
  // public auth path must equal the server-side mount (/api/auth everywhere)
  baseURL: new URL("/api/auth", getServerUrl(env.VITE_DASHBOARD_ORIGIN)).toString(),
  plugins: [preserveInitialOAuthQuery(), oauthProviderClient(), oauthDeviceAuthorizationClient()],
});
