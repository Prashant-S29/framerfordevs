import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";
import { getUser } from "@/functions/get-user";
import { getAuthenticatedRedirect, getSafeAuthenticatedReturnTo } from "@/lib/auth-navigation";
import { buildInvitationAcceptancePath, parseInvitationTokenHash } from "@/lib/invitation-link";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    returnTo: getSafeAuthenticatedReturnTo(search.returnTo) ?? undefined,
  }),
  beforeLoad: async ({ search }) => {
    const session = await getUser();

    const authenticatedRedirect = getAuthenticatedRedirect(session, search.returnTo);

    if (authenticatedRedirect) {
      throw authenticatedRedirect;
    }
  },
  component: RouteComponent,
});

function RouteComponent() {
  const [showSignIn, setShowSignIn] = useState(false);
  const { returnTo } = Route.useSearch();

  function handleAuthenticated() {
    const token = parseInvitationTokenHash(window.location.hash);
    if (token) {
      window.location.assign(buildInvitationAcceptancePath(token));
      return;
    }
    window.location.assign(returnTo ?? "/dashboard");
  }

  return showSignIn ? (
    <SignInForm
      onSwitchToSignUp={() => setShowSignIn(false)}
      onAuthenticated={handleAuthenticated}
    />
  ) : (
    <SignUpForm
      onSwitchToSignIn={() => setShowSignIn(true)}
      onAuthenticated={handleAuthenticated}
    />
  );
}
