import { Badge } from "@framerfordevs/ui/components/badge";

import type { StudioPublicationStatusDto } from "../../../../contracts/content";
import { studioPublicationBadge } from "..";

export function StudioPublicationBadge({
  status,
}: {
  readonly status: StudioPublicationStatusDto;
}) {
  const badge = studioPublicationBadge(status);
  return (
    <Badge
      variant={
        badge.kind === "published" ? "default" : badge.kind === "changed" ? "secondary" : "outline"
      }
      className="studio-publication-badge"
      data-state={badge.kind}
    >
      <span className="sr-only">Publication status: </span>
      {badge.label}
    </Badge>
  );
}
