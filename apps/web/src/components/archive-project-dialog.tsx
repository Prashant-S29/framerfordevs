import type { Project } from "@framerfordevs/api/contracts/platform";
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
import { ArchiveIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

export function ArchiveProjectDialog({ project }: { readonly project: Project }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const archiveProject = useMutation(
    orpc.platform.projects.archive.mutationOptions({
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
      <AlertDialogTrigger render={<Button variant="destructive" />}>
        <ArchiveIcon data-icon="inline-start" />
        Archive project
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive {project.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            The project key stays reserved, and environments, capabilities, and audit history are
            preserved. Archived projects cannot be edited.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={archiveProject.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={archiveProject.isPending}
            onClick={() =>
              archiveProject.mutate({ projectId: project.id, version: project.version })
            }
          >
            {archiveProject.isPending ? <Spinner data-icon="inline-start" /> : null}
            {archiveProject.isPending ? "Archiving…" : "Archive project"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
