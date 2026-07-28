import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";
import { getUser } from "@/functions/get-user";
import { getAuthenticatedRedirect } from "@/lib/auth-navigation";

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

  return showSignIn ? (
    <SignInForm onSwitchToSignUp={() => setShowSignIn(false)} />
  ) : (
    <SignUpForm onSwitchToSignIn={() => setShowSignIn(true)} />
  );
}
