import type { Project } from "@framerfordevs/api/contracts/platform/index";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@framerfordevs/ui/components/alert-dialog";
import { Button } from "@framerfordevs/ui/components/button";
import { Spinner } from "@framerfordevs/ui/components/spinner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCcwIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

export function RestoreProjectDialog({ project }: { readonly project: Project }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const restoreProject = useMutation(
    orpc.platform.projects.restore.mutationOptions({
      onSuccess: async (response) => {
        await queryClient.invalidateQueries({ queryKey: orpc.platform.projects.key() });
        toast.success(response.message);
        setOpen(false);
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button />}>
        <RotateCcwIcon data-icon="inline-start" />
        Restore project
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Restore {project.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Existing environments, locales, credentials, content, webhooks, and configuration will
            become reachable again under their current access rules. Nothing is republished or
            replayed automatically.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={restoreProject.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={restoreProject.isPending}
            onClick={() =>
              restoreProject.mutate({ projectId: project.id, version: project.version })
            }
          >
            {restoreProject.isPending ? <Spinner data-icon="inline-start" /> : null}
            {restoreProject.isPending ? "Restoring…" : "Restore project"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
