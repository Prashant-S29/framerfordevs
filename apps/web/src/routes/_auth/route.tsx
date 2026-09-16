import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { getUser } from "@/functions/get-user";

export const Route = createFileRoute("/_auth")({
  ssr: "data-only",
  component: AuthLayout,
  beforeLoad: async ({ location }) => {
    const session = await getUser();
    if (!session) {
      throw redirect({
        to: "/login",
        search: {
          returnTo: `${location.pathname}${location.searchStr}`,
        },
      });
    }
    return { session };
  },
});

function AuthLayout() {
  return <Outlet />;
}
