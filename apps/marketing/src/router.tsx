// Creates the independent marketing router with intent preloading and bounded not-found output.

import { createRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultNotFoundComponent: () => (
      <main className="mx-auto flex min-h-svh max-w-xl items-center px-6 py-16">
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl font-semibold">Page not found</h1>
          <p className="text-muted-foreground">The requested marketing page does not exist.</p>
          <a className="underline underline-offset-4" href="/">
            Return home
          </a>
        </div>
      </main>
    ),
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
