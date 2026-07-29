import type { Project } from "@framerfordevs/api/contracts/platform";
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
import { Field, FieldError, FieldGroup, FieldLabel } from "@framerfordevs/ui/components/field";
import { Input } from "@framerfordevs/ui/components/input";
import { Spinner } from "@framerfordevs/ui/components/spinner";
import { Textarea } from "@framerfordevs/ui/components/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { PencilIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { editProjectFormSchema } from "@/lib/platform-validation";
import { orpc } from "@/utils/orpc";

function fieldError(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("message" in error)) return undefined;
  return typeof error.message === "string" ? error.message : undefined;
}

export function EditProjectDialog({ project }: { readonly project: Project }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const updateProject = useMutation(
    orpc.platform.projects.update.mutationOptions({
      onSuccess: async (response) => {
        await queryClient.invalidateQueries({ queryKey: orpc.platform.projects.key() });
        toast.success(response.message);
        setOpen(false);
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const form = useForm({
    defaultValues: {
      name: String(project.name),
      description: project.description ? String(project.description) : "",
    },
    validators: { onSubmit: editProjectFormSchema },
    onSubmit: ({ value }) => {
      const description = value.description.trim().normalize("NFC");
      updateProject.mutate({
        projectId: project.id,
        version: project.version,
        name: value.name.trim().normalize("NFC"),
        description: description || null,
      });
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          form.reset({
            name: String(project.name),
            description: project.description ? String(project.description) : "",
          });
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>
        <PencilIcon data-icon="inline-start" />
        Edit project
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
          <DialogDescription>
            Names and descriptions can change. The project key remains immutable.
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
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={Boolean(message)}
                      autoComplete="off"
                    />
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
                      rows={4}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={Boolean(message)}
                      autoComplete="off"
                    />
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
                    disabled={!canSubmit || isSubmitting || updateProject.isPending}
                  >
                    {updateProject.isPending ? <Spinner data-icon="inline-start" /> : null}
                    {updateProject.isPending ? "Saving…" : "Save changes"}
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
