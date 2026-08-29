// Owns the exact hosted Authoring operation gateway while keeping bearer authority in Node memory.

import { authoringV1 } from "@framerfordevs/sdk/authoring";
import { Cause, Effect, Exit, Option } from "effect";

import { canonicalJsonBytes, sha256, toJsonValue } from "../../canonical";
import type { EditorLoopbackOperationResponse } from "../loopback";
import type { EditorOperationRequest } from "../protocol";
import { CliRetryJournalConflictError } from "../../errors";
import { acquireContentCommand, clearContentCommand } from "../../retry-journal";
import type { ContentMutationOperation } from "../../schema";

type Operation<Name extends EditorOperationRequest["operation"]> = Extract<
  EditorOperationRequest,
  { readonly operation: Name }
>;

interface HostedResponse {
  readonly status: number;
  readonly body: unknown;
}

export interface EditorAuthoringGateway {
  readonly formGet: (request: Operation<"form.get">) => Promise<HostedResponse>;
  readonly entriesList: (request: Operation<"entries.list">) => Promise<HostedResponse>;
  readonly entryGet: (request: Operation<"entry.get">) => Promise<HostedResponse>;
  readonly entryCreate: (
    request: Operation<"entry.create">,
    commandId: string,
  ) => Promise<HostedResponse>;
  readonly entryRename: (request: Operation<"entry.rename">) => Promise<HostedResponse>;
  readonly entrySave: (
    request: Operation<"entry.save">,
    commandId: string,
  ) => Promise<HostedResponse>;
  readonly publicationStatus: (request: Operation<"publication.status">) => Promise<HostedResponse>;
  readonly publicationValidate: (
    request: Operation<"publication.validate">,
  ) => Promise<HostedResponse>;
  readonly publicationPublish: (
    request: Operation<"publication.publish">,
    commandId: string,
  ) => Promise<HostedResponse>;
  readonly publicationUnpublish: (
    request: Operation<"publication.unpublish">,
    commandId: string,
  ) => Promise<HostedResponse>;
}

export interface EditorAuthoringHandlerInput {
  readonly projectRoot: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly localSchema?: () => unknown;
  readonly gateway: EditorAuthoringGateway;
  readonly acquireCommand?: (
    operation: ContentMutationOperation,
    fingerprint: string,
  ) => Promise<{ readonly commandId: string }>;
  readonly clearCommand?: (commandId: string) => Promise<void>;
}

function safeUpstream(response: {
  readonly status: number;
  readonly body: unknown | null;
}): HostedResponse {
  return response.body === null
    ? { status: 502, body: { ok: false, code: "EDITOR_UPSTREAM_INVALID" } }
    : { status: response.status, body: response.body };
}

export function makeEditorAuthoringGateway(input: {
  readonly baseUrl: string;
  readonly token: () => string | null;
  readonly projectId: string;
  readonly environmentId: string;
}): EditorAuthoringGateway {
  const client = () => {
    const token = input.token();
    if (token === null) throw new Error("EDITOR_CREDENTIAL_CLEARED");
    return authoringV1({
      baseUrl: input.baseUrl,
      token,
      projectId: input.projectId,
      environmentId: input.environmentId,
    });
  };
  return {
    formGet: async (request) => safeUpstream(await client().form.get(request.collectionKey)),
    entriesList: async (request) =>
      safeUpstream(
        await client().entries.list(request.collectionKey, request.locale, {
          ...(request.limit === undefined ? {} : { limit: request.limit }),
          ...(request.cursor === undefined ? {} : { cursor: request.cursor }),
        }),
      ),
    entryGet: async (request) =>
      safeUpstream(
        await client().entries.getDraft(request.collectionKey, request.locale, request.entryId),
      ),
    entryCreate: async (request, commandId) =>
      safeUpstream(
        await client().entries.create(request.collectionKey, request.locale, {
          displayName: request.displayName,
          schemaRevisionId: request.schemaRevisionId,
          contractHash: request.contractHash,
          commandId,
          mutations: request.mutations,
        }),
      ),
    entryRename: async (request) =>
      safeUpstream(
        await client().entries.rename(request.collectionKey, request.locale, request.entryId, {
          displayName: request.displayName,
          expectedNameVersion: request.expectedNameVersion,
        }),
      ),
    entrySave: async (request, commandId) =>
      safeUpstream(
        await client().entries.saveDraft(request.collectionKey, request.locale, request.entryId, {
          schemaRevisionId: request.schemaRevisionId,
          contractHash: request.contractHash,
          commandId,
          expectedSharedVersion: request.expectedSharedVersion,
          expectedLocalizedVersion: request.expectedLocalizedVersion,
          mutations: request.mutations,
        }),
      ),
    publicationStatus: async (request) =>
      safeUpstream(
        await client().entries.publicationStatus(
          request.collectionKey,
          request.locale,
          request.entryId,
        ),
      ),
    publicationValidate: async (request) =>
      safeUpstream(
        await client().entries.validatePublication(
          request.collectionKey,
          request.locale,
          request.entryId,
        ),
      ),
    publicationPublish: async (request, commandId) =>
      safeUpstream(
        await client().entries.publish(request.collectionKey, request.locale, request.entryId, {
          commandId,
          authorityHash: request.authorityHash,
          expectedStateVersion: request.expectedStateVersion,
          expectedPublicationId: request.expectedPublicationId,
          expectedSchemaRevisionId: request.expectedSchemaRevisionId,
          expectedContractHash: request.expectedContractHash,
          expectedSharedVersion: request.expectedSharedVersion,
          expectedSharedRevisionId: request.expectedSharedRevisionId,
          expectedLocalizedVersion: request.expectedLocalizedVersion,
          expectedLocalizedRevisionId: request.expectedLocalizedRevisionId,
        }),
      ),
    publicationUnpublish: async (request, commandId) =>
      safeUpstream(
        await client().entries.unpublish(request.collectionKey, request.locale, request.entryId, {
          commandId,
          expectedStateVersion: request.expectedStateVersion,
          expectedPublicationId: request.expectedPublicationId,
        }),
      ),
  };
}

function commandFingerprint(
  input: Pick<EditorAuthoringHandlerInput, "projectId" | "environmentId">,
  operation: ContentMutationOperation,
  request: EditorOperationRequest,
): string {
  return sha256(
    canonicalJsonBytes(
      toJsonValue({
        operation,
        projectId: input.projectId,
        environmentId: input.environmentId,
        requestSha256: sha256(canonicalJsonBytes(toJsonValue(request))),
      }),
    ),
  );
}

async function runJournalEffect<A, E>(effect: Effect.Effect<A, E>): Promise<A> {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  const failure = Option.getOrUndefined(Cause.failureOption(exit.cause));
  if (failure !== undefined) throw failure;
  throw new Error("EDITOR_JOURNAL_DEFECT");
}

function isRetryJournalConflict(cause: unknown): boolean {
  return (
    cause instanceof CliRetryJournalConflictError ||
    (typeof cause === "object" &&
      cause !== null &&
      Reflect.get(cause, "_tag") === "CliRetryJournalConflictError")
  );
}

export function createEditorAuthoringHandler(input: EditorAuthoringHandlerInput) {
  const acquire =
    input.acquireCommand ??
    ((operation: ContentMutationOperation, fingerprint: string) =>
      runJournalEffect(acquireContentCommand(input.projectRoot, operation, fingerprint)));
  const clear =
    input.clearCommand ??
    ((commandId: string) => runJournalEffect(clearContentCommand(input.projectRoot, commandId)));

  const withCommand = async (
    operation: ContentMutationOperation,
    request: EditorOperationRequest,
    send: (commandId: string) => Promise<HostedResponse>,
  ) => {
    const journal = await acquire(operation, commandFingerprint(input, operation, request));
    const response = await send(journal.commandId);
    await clear(journal.commandId);
    return response;
  };

  return async (request: EditorOperationRequest): Promise<EditorLoopbackOperationResponse> => {
    try {
      switch (request.operation) {
        case "schema.local":
          return input.localSchema === undefined
            ? { status: 503, body: { ok: false, code: "EDITOR_SCHEMA_UNAVAILABLE" } }
            : { status: 200, body: { ok: true, data: input.localSchema() } };
        case "form.get":
          return await input.gateway.formGet(request);
        case "entries.list":
          return await input.gateway.entriesList(request);
        case "entry.get":
          return await input.gateway.entryGet(request);
        case "entry.create":
          return await withCommand("entry.create", request, (commandId) =>
            input.gateway.entryCreate(request, commandId),
          );
        case "entry.rename":
          return await input.gateway.entryRename(request);
        case "entry.save":
          return await withCommand("entry.update", request, (commandId) =>
            input.gateway.entrySave(request, commandId),
          );
        case "publication.status":
          return await input.gateway.publicationStatus(request);
        case "publication.validate":
          return await input.gateway.publicationValidate(request);
        case "publication.publish":
          return await withCommand("entry.publish", request, (commandId) =>
            input.gateway.publicationPublish(request, commandId),
          );
        case "publication.unpublish":
          return await withCommand("entry.unpublish", request, (commandId) =>
            input.gateway.publicationUnpublish(request, commandId),
          );
      }
    } catch (cause) {
      return isRetryJournalConflict(cause)
        ? { status: 409, body: { ok: false, code: "EDITOR_COMMAND_PENDING" } }
        : { status: 502, body: { ok: false, code: "EDITOR_UPSTREAM_UNAVAILABLE" } };
    }
  };
}
