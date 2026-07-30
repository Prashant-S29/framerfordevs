import { Button } from "@framerfordevs/ui/components/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@framerfordevs/ui/components/field";
import { Input } from "@framerfordevs/ui/components/input";
import { Spinner } from "@framerfordevs/ui/components/spinner";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";

import Loader from "./loader";

export default function SignInForm({
  onSwitchToSignUp,
  onAuthenticated,
}: {
  readonly onSwitchToSignUp: () => void;
  readonly onAuthenticated?: () => void;
}) {
  const navigate = useNavigate({ from: "/" });
  const { isPending } = authClient.useSession();
  const form = useForm({
    defaultValues: { email: "", password: "" },
    onSubmit: async ({ value }) => {
      await authClient.signIn.email(
        { email: value.email, password: value.password },
        {
          onSuccess: () => {
            if (onAuthenticated) {
              onAuthenticated();
            } else {
              navigate({ to: "/dashboard" });
            }
            toast.success("Sign in successful");
          },
          onError: (error) => {
            toast.error(error.error.message || error.error.statusText);
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Enter a valid email address."),
        password: z.string().min(8, "Password must be at least 8 characters."),
      }),
    },
  });

  if (isPending) return <Loader />;

  return (
    <main className="mx-auto mt-10 flex w-full max-w-md flex-col gap-6 p-6">
      <h1 className="text-center text-3xl font-bold text-balance">Welcome Back</h1>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <FieldGroup>
          <form.Field name="email">
            {(field) => {
              const hasError = field.state.meta.errors.length > 0;
              return (
                <Field data-invalid={hasError}>
                  <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="email"
                    autoComplete="email"
                    spellCheck={false}
                    aria-invalid={hasError}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                  <FieldError>
                    {field.state.meta.errors.map((error) => error?.message).join(" ")}
                  </FieldError>
                </Field>
              );
            }}
          </form.Field>

          <form.Field name="password">
            {(field) => {
              const hasError = field.state.meta.errors.length > 0;
              return (
                <Field data-invalid={hasError}>
                  <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="password"
                    autoComplete="current-password"
                    aria-invalid={hasError}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                  <FieldError>
                    {field.state.meta.errors.map((error) => error?.message).join(" ")}
                  </FieldError>
                </Field>
              );
            }}
          </form.Field>

          <form.Subscribe
            selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}
          >
            {({ canSubmit, isSubmitting }) => (
              <Button type="submit" className="w-full" disabled={!canSubmit || isSubmitting}>
                {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
                {isSubmitting ? "Signing in…" : "Sign In"}
              </Button>
            )}
          </form.Subscribe>
        </FieldGroup>
      </form>
      <Button variant="link" onClick={onSwitchToSignUp}>
        Need an account? Sign Up
      </Button>
    </main>
  );
}
