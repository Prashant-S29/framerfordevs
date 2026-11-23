import { Schema } from "effect";

import { PreviewTargetUrl } from "../control-plane";
import { EntryId, EntryRevisionId } from "../entry";
import { LocaleTag } from "../locale";
import { AuthUserId, EnvironmentId, IsoDateTime, ProjectId, WorkspaceId } from "../platform";
import { ApiSuccessSchema } from "../response/api";
import { CollectionId, SchemaRevisionId } from "../schema";

export const previewHandoffLimits = {
  lifetimeMs: 5 * 60 * 1_000,
  tokenBytes: 2_048,
  requestBytes: 1_024,
} as const;

export const PreviewHandoffToken = Schema.String.check(
  Schema.isMinLength(16),
  Schema.isMaxLength(previewHandoffLimits.tokenBytes),
  Schema.isPattern(/^ffd_pvh_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/u),
).pipe(Schema.brand("PreviewHandoffToken"));
export type PreviewHandoffToken = typeof PreviewHandoffToken.Type;

export const PreviewHandoffSource = Schema.Literals(["current", "revision"]);
export type PreviewHandoffSource = typeof PreviewHandoffSource.Type;

export const PreviewHandoffIssuer = Schema.Literals(["studio", "authoring"]);
export type PreviewHandoffIssuer = typeof PreviewHandoffIssuer.Type;

export class PreviewHandoffClaims extends Schema.Class<PreviewHandoffClaims>(
  "PreviewHandoffClaims",
)(
  Schema.Struct({
    version: Schema.Literal(1),
    issuer: PreviewHandoffIssuer,
    userId: AuthUserId,
    workspaceId: WorkspaceId,
    projectId: ProjectId,
    environmentId: EnvironmentId,
    collectionId: CollectionId,
    entryId: EntryId,
    locale: LocaleTag,
    source: PreviewHandoffSource,
    schemaRevisionId: Schema.NullOr(SchemaRevisionId),
    sharedRevisionId: Schema.NullOr(EntryRevisionId),
    localizedRevisionId: Schema.NullOr(EntryRevisionId),
    targetVersion: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1)),
    issuedAtEpochMs: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
    expiresAtEpochMs: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  }),
) {}

export class PreviewHandoffRequest extends Schema.Class<PreviewHandoffRequest>(
  "PreviewHandoffRequest",
)(
  Schema.Struct({
    source: PreviewHandoffSource,
    revisionId: Schema.NullOr(EntryRevisionId),
  }),
) {}

export class PreviewHandoff extends Schema.Class<PreviewHandoff>("PreviewHandoff")(
  Schema.Struct({
    token: PreviewHandoffToken,
    expiresAt: IsoDateTime,
    previewUrl: PreviewTargetUrl,
    source: PreviewHandoffSource,
    schemaRevisionId: Schema.NullOr(SchemaRevisionId),
    sharedRevisionId: Schema.NullOr(EntryRevisionId),
    localizedRevisionId: Schema.NullOr(EntryRevisionId),
  }),
) {}

export const PreviewHandoffResponse = ApiSuccessSchema(PreviewHandoff);
