import type {
  StudioJsonObject,
  StudioPublicationPlanDto,
  StudioPublicationStatusDto,
  StudioPublishResultDto,
  StudioUnpublishResultDto,
} from "../../../contracts/content";

export type StudioPublicationBadgeKind = "published" | "changed" | "unpublished" | "never";

export function studioPublicationBadge(status: StudioPublicationStatusDto): {
  readonly kind: StudioPublicationBadgeKind;
  readonly label: string;
} {
  if (status.state === "never_published") return { kind: "never", label: "Never published" };
  if (status.state === "unpublished") return { kind: "unpublished", label: "Unpublished" };
  return status.changedSincePublication
    ? { kind: "changed", label: "Changed since publish" }
    : { kind: "published", label: "Published" };
}

export function studioPlanIsPublishable(plan: StudioPublicationPlanDto): boolean {
  return (
    plan.authorityHash !== null &&
    plan.validation.status === "valid" &&
    plan.validation.issues.length === 0 &&
    plan.entryIssues.length === 0
  );
}

export function studioPublishBody(
  plan: StudioPublicationPlanDto,
  commandId: string,
): StudioJsonObject | null {
  if (!studioPlanIsPublishable(plan) || plan.authorityHash === null) return null;
  return {
    commandId,
    authorityHash: plan.authorityHash,
    expectedStateVersion: plan.stateVersion,
    expectedPublicationId: plan.currentPublicationId,
    expectedSchemaRevisionId: plan.schemaRevisionId,
    expectedContractHash: plan.contractHash,
    expectedSharedVersion: plan.sharedVersion,
    expectedSharedRevisionId: plan.sharedRevisionId,
    expectedLocalizedVersion: plan.localizedVersion,
    expectedLocalizedRevisionId: plan.localizedRevisionId,
  };
}

export function studioUnpublishBody(
  status: StudioPublicationStatusDto,
  commandId: string,
): StudioJsonObject | null {
  if (status.state !== "published" || status.currentPublication === null) return null;
  return {
    commandId,
    expectedStateVersion: status.stateVersion,
    expectedPublicationId: status.currentPublication.id,
  };
}

export function studioPublishMessage(result: StudioPublishResultDto, locale: string): string {
  if (result.delivery.status === "superseded") {
    return `Published, but a newer publication command already changed ${locale}. Delivery serves the newest state.`;
  }
  if (result.resultKind === "no_op") {
    return `Already published. Delivery already serves this content for ${locale}.`;
  }
  return `Published. Delivery now serves publication ${result.publication.sequence} for ${locale}. Cached copies refresh shortly.`;
}

export function studioUnpublishMessage(result: StudioUnpublishResultDto, locale: string): string {
  if (result.delivery.status === "superseded") {
    return `Unpublished, but a newer publication command already changed ${locale}. Delivery serves the newest state.`;
  }
  if (result.resultKind === "no_op") return `This entry was already unpublished in ${locale}.`;
  return `Unpublished. Delivery no longer serves this entry in ${locale}. Cached copies refresh shortly.`;
}
