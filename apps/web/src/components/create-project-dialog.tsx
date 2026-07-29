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
import { Textarea } from "@framerfordevs/ui/components/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { projectFormSchema, projectKeyFromName } from "@/lib/platform-validation";
import { orpc } from "@/utils/orpc";

function fieldError(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("message" in error)) return undefined;
  return typeof error.message === "string" ? error.message : undefined;
}

export function CreateProjectDialog({
  workspaceId,
  onCreated,
}: {
  readonly workspaceId: string;
  readonly onCreated: (projectId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [isKeyEdited, setIsKeyEdited] = useState(false);
  const queryClient = useQueryClient();
  const createProject = useMutation(
    orpc.platform.projects.create.mutationOptions({
      onSuccess: async (response) => {
        await queryClient.invalidateQueries({ queryKey: orpc.platform.projects.key() });
        toast.success(response.message);
        setOpen(false);
        setIsKeyEdited(false);
        form.reset();
        onCreated(response.data.id);
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const form = useForm({
    defaultValues: {
      name: "",
      key: "",
      description: "",
    },
    validators: { onSubmit: projectFormSchema },
    onSubmit: ({ value }) => {
      const description = value.description.trim().normalize("NFC");
      createProject.mutate({
        workspaceId,
        name: value.name.trim().normalize("NFC"),
        key: value.key.trim(),
        description: description || null,
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <PlusIcon data-icon="inline-start" />
        New project
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create a project</DialogTitle>
          <DialogDescription>
            The project key becomes its immutable developer-facing identity.
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
                const message = fieldError(field.state.meta.errors[0]);
                return (
                  <Field data-invalid={Boolean(message)}>
                    <FieldLabel htmlFor={field.name}>Project name</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      maxLength={100}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => {
                        const name = event.target.value;
                        field.handleChange(name);
                        if (!isKeyEdited) {
                          form.setFieldValue("key", projectKeyFromName(name));
                        }
                      }}
                      aria-invalid={Boolean(message)}
                    />
                    <FieldError>{message}</FieldError>
                  </Field>
                );
              }}
            </form.Field>
            <form.Field name="key">
              {(field) => {
                const message = fieldError(field.state.meta.errors[0]);
                return (
                  <Field data-invalid={Boolean(message)}>
                    <FieldLabel htmlFor={field.name}>Project key</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      maxLength={63}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => {
                        setIsKeyEdited(true);
                        field.handleChange(event.target.value.toLowerCase());
                      }}
                      aria-invalid={Boolean(message)}
                      spellCheck={false}
                      autoComplete="off"
                    />
                    <FieldDescription>
                      Lowercase letters, numbers, and single hyphens. It cannot be changed later.
                    </FieldDescription>
                    <FieldError>{message}</FieldError>
                  </Field>
                );
              }}
            </form.Field>
            <form.Field name="description">
              {(field) => {
                const message = fieldError(field.state.meta.errors[0]);
                return (
                  <Field data-invalid={Boolean(message)}>
                    <FieldLabel htmlFor={field.name}>Description</FieldLabel>
                    <Textarea
                      id={field.name}
                      name={field.name}
                      maxLength={500}
                      rows={3}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={Boolean(message)}
                      autoComplete="off"
                    />
                    <FieldDescription>
                      Optional. Visible only in project management.
                    </FieldDescription>
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
                    disabled={!canSubmit || isSubmitting || createProject.isPending}
                  >
                    {createProject.isPending ? <Spinner data-icon="inline-start" /> : null}
                    {createProject.isPending ? "Creating…" : "Create project"}
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
