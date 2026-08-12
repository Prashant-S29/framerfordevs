import { Toaster } from "@framerfordevs/ui/components/sonner";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import type { orpc } from "@/utils/orpc";

import Header from "../components/header";

import appCss from "../index.css?url";
export interface RouterAppContext {
  orpc: typeof orpc;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Framer for Devs",
      },
      {
        name: "theme-color",
        content: "#252525",
      },
      {
        name: "referrer",
        content: "no-referrer",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),

  component: RootDocument,
});

function RootDocument() {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        <a
          href="#main-content"
          className="bg-background text-foreground sr-only z-50 p-2 focus:not-sr-only focus:fixed focus:left-2 focus:top-2"
        >
          Skip to main content
        </a>
        <div className="grid h-svh grid-rows-[auto_1fr]">
          <Header />
          <div id="main-content" className="min-w-0 overflow-auto">
            <Outlet />
          </div>
        </div>
        <Toaster richColors />
        {import.meta.env.DEV ? (
          <>
            <TanStackRouterDevtools position="bottom-left" />
            <ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
          </>
        ) : null}
        <Scripts />
      </body>
    </html>
  );
}
