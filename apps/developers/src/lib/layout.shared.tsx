// Owns shared public navigation options for Fumadocs home and documentation layouts.

import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

/** Keeps every documentation layout on one product-owned navigation model. */
export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: "Framer for Devs",
      url: "/docs",
    },
    links: [
      {
        text: "Get Started",
        url: "/docs/get-started",
        active: "nested-url",
      },
      {
        text: "API Contracts",
        url: "/api-reference",
        external: false,
        active: "nested-url",
      },
    ],
  };
}
