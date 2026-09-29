// Classifies one published collection before any Studio nested operation can load entry data.

import type { ProjectRole } from "../../../contracts/access";
import type { StudioCollectionConfigurationReason } from "../../../contracts/studio-content";

export type StudioCollectionProjectionDecision =
  | { readonly kind: "visible" }
  | { readonly kind: "hidden" }
  | {
      readonly kind: "configuration_invalid";
      readonly reason: StudioCollectionConfigurationReason;
    };

export interface StudioCollectionProjectionFacts {
  readonly role: ProjectRole;
  readonly activeFieldCount: number;
  readonly projectedRootFieldCount: number;
  readonly projectedPlacementCount: number;
}

function supportRole(role: ProjectRole): boolean {
  return role === "owner" || role === "developer";
}

/** Centralizes visible, non-enumerating, and owner/developer diagnostic outcomes. */
export function decideStudioCollectionProjection(
  facts: StudioCollectionProjectionFacts,
): StudioCollectionProjectionDecision {
  if (
    !Number.isInteger(facts.activeFieldCount) ||
    !Number.isInteger(facts.projectedRootFieldCount) ||
    !Number.isInteger(facts.projectedPlacementCount) ||
    facts.activeFieldCount < 0 ||
    facts.projectedRootFieldCount < 0 ||
    facts.projectedPlacementCount < 0
  ) {
    throw new RangeError("Studio collection projection counts must be non-negative integers.");
  }
  if (facts.activeFieldCount === 0) {
    return supportRole(facts.role)
      ? { kind: "configuration_invalid", reason: "empty_schema" }
      : { kind: "hidden" };
  }
  if (facts.projectedRootFieldCount === 0 || facts.projectedPlacementCount === 0) {
    return supportRole(facts.role)
      ? { kind: "configuration_invalid", reason: "projection_invalid" }
      : { kind: "hidden" };
  }
  return { kind: "visible" };
}
