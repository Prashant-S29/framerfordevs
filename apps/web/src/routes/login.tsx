import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";
import { getUser } from "@/functions/get-user";
import { getAuthenticatedRedirect } from "@/lib/auth-navigation";
import { buildInvitationAcceptancePath, parseInvitationTokenHash } from "@/lib/invitation-link";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const session = await getUser();

    const authenticatedRedirect = getAuthenticatedRedirect(session);

    if (authenticatedRedirect) {
      throw authenticatedRedirect;
    }
  },
  component: RouteComponent,
});

function RouteComponent() {
  const [showSignIn, setShowSignIn] = useState(false);

  function handleAuthenticated() {
    const token = parseInvitationTokenHash(window.location.hash);
    if (token) {
      window.location.assign(buildInvitationAcceptancePath(token));
      return;
    }
    window.location.assign("/dashboard");
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
