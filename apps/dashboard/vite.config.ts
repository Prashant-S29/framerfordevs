// Builds the dashboard and provides only its approved same-origin reverse-proxy ingress paths.

import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, type ProxyOptions } from "vite";

const configuredBackend = process.env.INTERNAL_SERVER_URL ?? "http://localhost:3000";
const backendUrl = new URL(configuredBackend);
if (backendUrl.origin !== configuredBackend.replace(/\/$/u, "")) {
  throw new Error("INTERNAL_SERVER_URL must be an exact backend origin.");
}
const backendOrigin = backendUrl.origin;
const dashboardHost = new URL(process.env.VITE_DASHBOARD_ORIGIN ?? "http://localhost:3001").host;

function dashboardProxy(): ProxyOptions {
  return {
    target: backendOrigin,
    changeOrigin: true,
    xfwd: true,
    configure(proxy) {
      proxy.on("proxyReq", (request) => request.setHeader("X-Forwarded-Host", dashboardHost));
    },
  };
}

const securityHeaders = {
  "content-security-policy":
    "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
  "permissions-policy": "camera=(), geolocation=(), microphone=(), payment=()",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
} as const;

export default defineConfig({
  server: {
    port: 3001,
    proxy: {
      "/api/auth": dashboardProxy(),
      "/api/control-plane/v1": dashboardProxy(),
      "/rpc": dashboardProxy(),
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tailwindcss(),
    tanstackStart({ router: { entry: "./router/index.tsx" } }),
    nitro({
      routeRules: {
        "/**": { headers: securityHeaders },
        "/api/auth/**": {
          proxy: {
            to: `${backendOrigin}/api/auth/**`,
            headers: { "x-forwarded-host": dashboardHost },
          },
          headers: { ...securityHeaders, "cache-control": "no-store" },
        },
        "/api/control-plane/v1/**": {
          proxy: {
            to: `${backendOrigin}/api/control-plane/v1/**`,
            headers: { "x-forwarded-host": dashboardHost },
          },
          headers: { ...securityHeaders, "cache-control": "no-store" },
        },
        "/rpc/**": {
          proxy: {
            to: `${backendOrigin}/rpc/**`,
            headers: { "x-forwarded-host": dashboardHost },
          },
          headers: { ...securityHeaders, "cache-control": "no-store" },
        },
      },
    }),
    viteReact(),
  ],
});
