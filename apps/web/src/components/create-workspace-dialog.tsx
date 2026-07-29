import { Button } from "@framerfordevs/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@framerfordevs/ui/components/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@framerfordevs/ui/components/field";
import { Input } from "@framerfordevs/ui/components/input";
import { Spinner } from "@framerfordevs/ui/components/spinner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { workspaceFormSchema } from "@/lib/platform-validation";
import { orpc } from "@/utils/orpc";

function errorMessage(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("message" in error)) return undefined;
  return typeof error.message === "string" ? error.message : undefined;
}

export function CreateWorkspaceDialog({
  onCreated,
}: {
  readonly onCreated?: (workspaceId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const createWorkspace = useMutation(
    orpc.platform.workspaces.create.mutationOptions({
      onSuccess: async (response) => {
        await queryClient.invalidateQueries({ queryKey: orpc.platform.workspaces.key() });
        toast.success(response.message);
        setOpen(false);
        form.reset();
        onCreated?.(response.data.id);
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const form = useForm({
    defaultValues: { name: "" },
    validators: { onSubmit: workspaceFormSchema },
    onSubmit: ({ value }) => {
      createWorkspace.mutate({ name: value.name.trim().normalize("NFC") });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <PlusIcon data-icon="inline-start" />
        New workspace
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a workspace</DialogTitle>
          <DialogDescription>
            Workspaces own projects and provide the top-level team boundary.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <FieldGroup>
            <form.Field name="name">
              {(field) => {
                const message = errorMessage(field.state.meta.errors[0]);
                return (
                  <Field data-invalid={Boolean(message)}>
                    <FieldLabel htmlFor={field.name}>Workspace name</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      autoComplete="organization"
                      maxLength={100}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={Boolean(message)}
                    />
                    <FieldDescription>For example, your agency or client name.</FieldDescription>
                    <FieldError>{message}</FieldError>
                  </Field>
                );
              }}
            </form.Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <form.Subscribe
                selector={(state) => ({
                  canSubmit: state.canSubmit,
                  isSubmitting: state.isSubmitting,
                })}
              >
                {({ canSubmit, isSubmitting }) => (
                  <Button
                    type="submit"
                    disabled={!canSubmit || isSubmitting || createWorkspace.isPending}
                  >
                    {createWorkspace.isPending ? <Spinner data-icon="inline-start" /> : null}
                    {createWorkspace.isPending ? "Creating…" : "Create workspace"}
                  </Button>
                )}
              </form.Subscribe>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
