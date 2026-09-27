import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";

import { StudioNotFound, StudioShell } from "./shell";
import "./styles.css";

function configuredMount(): string {
  const content = document.querySelector<HTMLMetaElement>('meta[name="ffd-studio-mount"]')?.content;
  if (content === undefined || !/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/u.test(content)) {
    throw new Error("Studio mount configuration is invalid.");
  }
  return content;
}

function configuredDashboardOrigin(): string {
  const content = document.querySelector<HTMLMetaElement>(
    'meta[name="ffd-studio-dashboard-origin"]',
  )?.content;
  if (content === undefined) throw new Error("Studio dashboard configuration is invalid.");
  const url = new URL(content);
  const loopback =
    url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (
    url.origin !== content ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
  )
    throw new Error("Studio dashboard configuration is invalid.");
  return content;
}

const mountPath = configuredMount();
const dashboardOrigin = configuredDashboardOrigin();
const rootRoute = createRootRoute();
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => <StudioShell mountPath={mountPath} dashboardOrigin={dashboardOrigin} />,
});
const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute]),
  basepath: mountPath,
  defaultNotFoundComponent: () => <StudioNotFound dashboardOrigin={dashboardOrigin} />,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const target = document.querySelector("#studio-root");
if (!(target instanceof HTMLElement)) throw new Error("Studio root is missing.");

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});
createRoot(target).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
