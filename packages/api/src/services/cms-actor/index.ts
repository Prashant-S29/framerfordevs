import type { ApiCredentialId } from "../../contracts/access";
import type { CmsActor } from "../../contracts/authoring";
import type { AuthUserId } from "../../contracts/platform";

export type CmsActorInput = AuthUserId | CmsActor;

export function normalizeCmsActor(actor: CmsActorInput): CmsActor {
  return typeof actor === "string" ? { kind: "user", id: actor } : actor;
}

export function cmsActorReferences(actorInput: CmsActorInput): {
  readonly userId: AuthUserId | null;
  readonly credentialId: ApiCredentialId | null;
} {
  const actor = normalizeCmsActor(actorInput);
  return actor.kind === "user"
    ? { userId: actor.id, credentialId: null }
    : { userId: null, credentialId: actor.id };
}

export function cmsActorFingerprintValue(actorInput: CmsActorInput): AuthUserId | CmsActor {
  const actor = normalizeCmsActor(actorInput);
  return actor.kind === "user" ? actor.id : actor;
}

export function cmsAuditActor(actorInput: CmsActorInput): {
  readonly actorType: "user" | "credential";
  readonly actorId: AuthUserId | ApiCredentialId;
} {
  const actor = normalizeCmsActor(actorInput);
  return { actorType: actor.kind, actorId: actor.id };
}

export function cmsActorMatches(
  actorInput: CmsActorInput,
  row: {
    readonly userId: string | null;
    readonly credentialId: string | null;
  },
): boolean {
  const actor = normalizeCmsActor(actorInput);
  return actor.kind === "user"
    ? row.userId === actor.id && row.credentialId === null
    : row.credentialId === actor.id && row.userId === null;
}
