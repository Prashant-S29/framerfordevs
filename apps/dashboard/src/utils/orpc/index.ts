import type { AppRouter } from "@framerfordevs/api/routers/index";
import { env } from "@framerfordevs/env/dashboard";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { toast } from "sonner";

import {
  adaptControlPlaneResponse,
  planControlPlaneRequest,
  readControlPlaneResponse,
} from "@/lib/control-plane-transport";
import { getServerUrl } from "@/lib/server-url";

export function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (query.meta?.["suppressGlobalErrorToast"] === true) return;
        toast.error(`Error: ${error.message}`, {
          action: {
            label: "retry",
            onClick: () => {
              query.invalidate();
            },
          },
        });
      },
    }),
    defaultOptions: { queries: { staleTime: 60 * 1000 } },
  });
}

async function executeDashboardRequest(
  request: Request,
  init: RequestInit,
  path: ReadonlyArray<string>,
  input: unknown,
  serverSide: boolean,
): Promise<Response> {
  const plan = planControlPlaneRequest(path, input);
  if (plan === null) {
    return fetch(request, { ...init, credentials: "include" });
  }

  const headers = new Headers({ Accept: "application/json" });
  for (const name of ["cookie", "traceparent", "x-request-id"] as const) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  if (plan.body !== null) headers.set("Content-Type", "application/json");
  if (serverSide) {
    headers.set("Origin", env.VITE_DASHBOARD_ORIGIN);
    headers.set("X-Forwarded-Host", new URL(env.VITE_DASHBOARD_ORIGIN).host);
  }

  const response = await fetch(new URL(plan.path, getServerUrl(env.VITE_DASHBOARD_ORIGIN)), {
    method: plan.method,
    headers,
    body: plan.body === null ? undefined : JSON.stringify(plan.body),
    credentials: "include",
    redirect: "error",
    signal: request.signal,
  });
  const body = await readControlPlaneResponse(response);
  return adaptControlPlaneResponse(response, body, plan.transformData);
}

const getClientLink = createIsomorphicFn()
  .client(
    () =>
      new RPCLink({
        url: `${getServerUrl(env.VITE_DASHBOARD_ORIGIN)}/rpc`,
        fetch(request, init, _options, path, input) {
          return executeDashboardRequest(request, init, path, input, false);
        },
      }),
  )
  .server(
    () =>
      new RPCLink({
        url: `${getServerUrl(env.VITE_DASHBOARD_ORIGIN)}/rpc`,
        headers: () => getRequestHeaders(),
        fetch(request, init, _options, path, input) {
          return executeDashboardRequest(request, init, path, input, true);
        },
      }),
  );

const link = getClientLink();

const getORPCClient = () => {
  return createORPCClient(link) as RouterClient<AppRouter>;
};

export const client: RouterClient<AppRouter> = getORPCClient();

export const orpc = createTanstackQueryUtils(client);
