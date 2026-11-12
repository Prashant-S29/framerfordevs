import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@framerfordevs/ui/components/alert/dialog";

export default function DirtySignOutDialog({
  open,
  onCancel,
  onConfirm,
}: {
  readonly open: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard changes and sign out?</AlertDialogTitle>
          <AlertDialogDescription>
            Unsaved Studio changes in this tab will be lost before signing out.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Keep editing</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Discard and sign out</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
