// Runs exact Authoring content workflows after all local files and flags are validated.

import { authoringV1 } from "@framerfordevs/sdk/authoring";
import { Effect, ManagedRuntime } from "effect";

import { canonicalJsonBytes, sha256, toJsonValue } from "./canonical";
import type { PreparedContentCommand } from "./content-bin";
import { CredentialStoreLive } from "./credential-store";
import { getValidAccessToken } from "./oauth-device";
import { acquireContentCommand, clearContentCommand } from "./retry-journal";
import type { ContentMutationOperation } from "./schema";
import { makeToolingHttpClient } from "./tooling-http-client";

function tokenForOrigin(apiOrigin: string) {
  const management = process.env["FFD_MANAGEMENT_TOKEN"];
  return management !== undefined && management.length > 0
    ? Effect.succeed(management)
    : getValidAccessToken({ apiOrigin });
}

function request<A>(operation: () => Promise<A>) {
  return Effect.tryPromise({
    try: operation,
    catch: (cause) => new Error(`CLI_AUTHORING_TRANSPORT:${String(cause)}`),
  });
}

function responseData<A>(response: {
  readonly body:
    | { readonly ok: true; readonly data: A }
    | { readonly ok: false; readonly error: { readonly code: string } }
    | null;
}) {
  if (response.body === null) return Effect.fail(new Error("CLI_AUTHORING_RESPONSE_EMPTY"));
  if (!response.body.ok)
    return Effect.fail(new Error(`CLI_AUTHORING_HTTP_${response.body.error.code}`));
  return Effect.succeed(response.body.data);
}

function fingerprint(
  input: PreparedContentCommand,
  environmentId: string,
  operation: ContentMutationOperation,
  payload: unknown,
) {
  const payloadSha256 = sha256(canonicalJsonBytes(toJsonValue(payload)));
  return sha256(
    canonicalJsonBytes(
      toJsonValue({
        operation,
        projectId: input.config.projectId,
        environmentId,
        collection: input.collection,
        locale: input.locale,
        entryId: input.entryId ?? null,
        payloadSha256,
      }),
    ),
  );
}

const contentOnline = Effect.fn("cli.authoring.content.command")(function* (
  input: PreparedContentCommand,
) {
  const token = yield* tokenForOrigin(input.config.apiBaseUrl);
  const tooling = makeToolingHttpClient({ baseUrl: input.config.apiBaseUrl, token });
  const environmentId =
    input.environmentId ??
    (yield* tooling.getManifestPage(input.config.projectId, input.config.environment, null, 1))
      .environmentId;
  const client = authoringV1({
    baseUrl: input.config.apiBaseUrl,
    token,
    projectId: input.config.projectId,
    environmentId,
  });

  if (input.command === "entry list") {
    const items: Array<unknown> = [];
    const seen = new Set<string>();
    let cursor: string | undefined;
    for (let pageNumber = 0; pageNumber < 20; pageNumber += 1) {
      const response = yield* request(() =>
        client.entries.list(input.collection, input.locale, { limit: 50, cursor }),
      );
      const page = yield* responseData(response);
      if (items.length + page.items.length > 1_000) {
        return yield* Effect.fail(new Error("CLI_ENTRY_LIST_TOO_LARGE"));
      }
      items.push(...page.items);
      if (page.nextCursor === null) {
        return { command: input.command, accepted: true, environmentId, items };
      }
      if (seen.has(page.nextCursor)) return yield* Effect.fail(new Error("CLI_PAGINATION_INVALID"));
      seen.add(page.nextCursor);
      cursor = page.nextCursor;
    }
    return yield* Effect.fail(new Error("CLI_ENTRY_LIST_TOO_LARGE"));
  }

  if (input.command === "entry get") {
    const response = yield* request(() =>
      client.entries.getDraft(input.collection, input.locale, input.entryId ?? ""),
    );
    const draft = yield* responseData(response);
    return { command: input.command, accepted: true, environmentId, draft };
  }

  if (input.command === "entry create") {
    if (input.name === undefined || input.createAuthority === null) {
      return yield* Effect.fail(new Error("CLI_CONTENT_FLAGS_INVALID"));
    }
    const operation: ContentMutationOperation = "entry.create";
    const bodyWithoutCommand = {
      displayName: input.name,
      schemaRevisionId: input.createAuthority.revisionId,
      contractHash: input.createAuthority.contractHash,
      mutations: input.mutations,
    };
    const journal = yield* acquireContentCommand(
      input.projectRoot,
      operation,
      fingerprint(input, environmentId, operation, bodyWithoutCommand),
    );
    const response = yield* request(() =>
      client.entries.create(input.collection, input.locale, {
        ...bodyWithoutCommand,
        commandId: journal.commandId,
      }),
    );
    yield* clearContentCommand(input.projectRoot, journal.commandId);
    const created = yield* responseData(response);
    return { command: input.command, accepted: true, environmentId, created };
  }

  if (input.command === "entry update") {
    const operation: ContentMutationOperation = "entry.update";
    const journal = yield* acquireContentCommand(
      input.projectRoot,
      operation,
      fingerprint(input, environmentId, operation, { mutations: input.mutations }),
    );
    const result = yield* request(() =>
      client.helpers.saveCurrentDraft(
        input.collection,
        input.locale,
        input.entryId ?? "",
        journal.commandId,
        input.mutations,
      ),
    );
    yield* clearContentCommand(input.projectRoot, journal.commandId);
    if (result.kind === "draft_unavailable") {
      yield* responseData(result.response);
      return yield* Effect.fail(new Error("CLI_DRAFT_UNAVAILABLE"));
    }
    const updated = yield* responseData(result.response);
    return { command: input.command, accepted: true, environmentId, updated };
  }

  if (input.command === "entry publish") {
    const operation: ContentMutationOperation = "entry.publish";
    const journal = yield* acquireContentCommand(
      input.projectRoot,
      operation,
      fingerprint(input, environmentId, operation, {}),
    );
    const result = yield* request(() =>
      client.helpers.validateThenPublish(
        input.collection,
        input.locale,
        input.entryId ?? "",
        journal.commandId,
      ),
    );
    if (result.kind === "not_publishable") {
      yield* clearContentCommand(input.projectRoot, journal.commandId);
      const validation = yield* responseData(result.validation);
      return { command: input.command, accepted: false, environmentId, validation };
    }
    yield* clearContentCommand(input.projectRoot, journal.commandId);
    const validation = yield* responseData(result.validation);
    const published = yield* responseData(result.publication);
    return { command: input.command, accepted: true, environmentId, validation, published };
  }

  const operation: ContentMutationOperation = "entry.unpublish";
  const journal = yield* acquireContentCommand(
    input.projectRoot,
    operation,
    fingerprint(input, environmentId, operation, {}),
  );
  const statusResponse = yield* request(() =>
    client.entries.publicationStatus(input.collection, input.locale, input.entryId ?? ""),
  );
  const status = yield* responseData(statusResponse);
  const response = yield* request(() =>
    client.entries.unpublish(input.collection, input.locale, input.entryId ?? "", {
      commandId: journal.commandId,
      expectedStateVersion: status.stateVersion,
      expectedPublicationId: status.currentPublication?.id ?? null,
    }),
  );
  yield* clearContentCommand(input.projectRoot, journal.commandId);
  const unpublished = yield* responseData(response);
  return { command: input.command, accepted: true, environmentId, unpublished };
});

export async function runContentOnline(input: PreparedContentCommand) {
  const runtime = ManagedRuntime.make(CredentialStoreLive);
  try {
    return await runtime.runPromise(contentOnline(input));
  } finally {
    await runtime.dispose();
  }
}
