// Establishes the public Fumadocs provider, metadata, theme, search, and document shell.

import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { RootProvider } from "fumadocs-ui/provider/tanstack";
import { lazy } from "react";

import styles from "../styles.css?url";

const PublicSearchDialog = lazy(async () => {
  const module = await import("@/components/search");
  return { default: module.PublicSearchDialog };
});

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Framer for Devs — Developer Documentation" },
      {
        name: "description",
        content:
          "Learn how to model, publish, preview, deliver, generate, and react to content with Framer for Devs.",
      },
      { name: "referrer", content: "no-referrer" },
      { name: "theme-color", content: "#fafafa" },
    ],
    links: [{ rel: "stylesheet", href: styles }],
  }),
  component: RootDocument,
});

function RootDocument() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="flex min-h-screen flex-col">
        <RootProvider search={{ SearchDialog: PublicSearchDialog }}>
          <Outlet />
        </RootProvider>
        <Scripts />
      </body>
    </html>
  );
}
