import { env } from "@framerfordevs/env/developers";
import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: "Framer for Devs",
      url: env.VITE_MARKETING_ORIGIN,
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
      {
        text: "Dashboard",
        url: env.VITE_DASHBOARD_ORIGIN,
        external: true,
      },
    ],
  };
}
