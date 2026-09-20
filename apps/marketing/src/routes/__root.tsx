// Defines the minimal marketing document shell and baseline public security metadata.

import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";

import styles from "../index.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Framer for Devs" },
      {
        name: "description",
        content: "Backend-agnostic content and website operations for developer-owned frontends.",
      },
      { name: "referrer", content: "no-referrer" },
    ],
    links: [{ rel: "stylesheet", href: styles }],
  }),
  component: RootDocument,
});

function RootDocument() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
