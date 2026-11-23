import { Button } from "@framerfordevs/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { ExternalLinkIcon } from "lucide-react";

import { orpc } from "@/utils/orpc";

export function OpenStudioLink({
  projectId,
  environmentId,
  size = "default",
}: {
  readonly projectId: string;
  readonly environmentId: string;
  readonly size?: "default" | "sm";
}) {
  const registration = useQuery({
    ...orpc.platform.projects.studioRegistration.get.queryOptions({
      input: { projectId, environmentId },
    }),
    meta: { suppressGlobalErrorToast: true },
    retry: false,
  });
  const active = registration.data?.data;
  if (registration.isPending) return null;
  if (active === undefined || active.runtimeStatus !== "active") {
    return (
      <p className="text-muted-foreground text-sm">
        Edit content in the Studio. Register a Studio for this project, or run{" "}
        <code translate="no">ffd editor</code>.
      </p>
    );
  }
  return (
    <Button
      variant="outline"
      size={size}
      render={
        <a
          href={`${active.applicationOrigin}${active.mountPath}`}
          rel="noreferrer"
          target="_blank"
        />
      }
    >
      Open Studio <ExternalLinkIcon data-icon="inline-end" />
    </Button>
  );
}
