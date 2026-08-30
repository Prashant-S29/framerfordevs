// Runs excluded Presentation operator workflows through the CLI-owned Authoring client.

import { Effect, ManagedRuntime } from "effect";

import { makeAuthoringOperatorClient } from "../../authoring/client";
import { canonicalJsonBytes, sha256, toJsonValue } from "../../canonical";
import { CredentialStore, CredentialStoreLive } from "../../credential-store";
import { getValidAccessToken } from "../../oauth-device";
import {
  acquirePresentationPublishCommand,
  clearPresentationPublishCommand,
} from "../../retry-journal";
import type { CliConfigV2 } from "../../schema";
import { makeToolingHttpClient } from "../../tooling-http-client";
import { PresentationEditDocument } from "../document";

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
  if (!response.body.ok) {
    return Effect.fail(new Error(`CLI_AUTHORING_HTTP_${response.body.error.code}`));
  }
  return Effect.succeed(response.body.data);
}

function resolveEnvironmentId(
  config: CliConfigV2,
  token: string,
  knownEnvironmentId: string | null,
) {
  if (knownEnvironmentId !== null) return Effect.succeed(knownEnvironmentId);
  const tooling = makeToolingHttpClient({ baseUrl: config.apiBaseUrl, token });
  return tooling
    .getManifestPage(config.projectId, config.environment, null, 1)
    .pipe(Effect.map((manifest) => manifest.environmentId));
}

const getPresentationOnline = Effect.fn("cli.authoring.presentation.get")(function* (input: {
  readonly config: CliConfigV2;
  readonly collection: string;
  readonly environmentId: string | null;
}) {
  const token = yield* tokenForOrigin(input.config.apiBaseUrl);
  const environmentId = yield* resolveEnvironmentId(input.config, token, input.environmentId);
  const client = makeAuthoringOperatorClient({
    baseUrl: input.config.apiBaseUrl,
    token,
    projectId: input.config.projectId,
    environmentId,
  });
  const response = yield* request(() => client.presentation.get(input.collection));
  const snapshot = yield* responseData(response);
  return PresentationEditDocument.make({
    documentVersion: 1,
    projectId: input.config.projectId,
    environmentId,
    environmentKey: input.config.environment,
    collection: input.collection,
    expectedRevisionId: snapshot.revision.revisionId,
    expectedSequence: snapshot.revision.sequence,
    presentation: snapshot.presentation,
  });
});

const publishPresentationOnline = Effect.fn("cli.authoring.presentation.publish")(
  function* (input: {
    readonly config: CliConfigV2;
    readonly projectRoot: string;
    readonly document: PresentationEditDocument;
  }) {
    const token = yield* tokenForOrigin(input.config.apiBaseUrl);
    const client = makeAuthoringOperatorClient({
      baseUrl: input.config.apiBaseUrl,
      token,
      projectId: input.config.projectId,
      environmentId: input.document.environmentId,
    });
    const fingerprint = sha256(
      canonicalJsonBytes(
        toJsonValue({
          operation: "presentation.publish",
          projectId: input.document.projectId,
          environmentId: input.document.environmentId,
          collection: input.document.collection,
          expectedRevisionId: input.document.expectedRevisionId,
          expectedSequence: input.document.expectedSequence,
          presentation: input.document.presentation,
        }),
      ),
    );
    const journal = yield* acquirePresentationPublishCommand(input.projectRoot, fingerprint);
    const response = yield* request(() =>
      client.presentation.publish(input.document.collection, {
        commandId: journal.commandId,
        expectedRevisionId: input.document.expectedRevisionId,
        expectedSequence: input.document.expectedSequence,
        presentation: input.document.presentation,
      }),
    );
    yield* clearPresentationPublishCommand(input.projectRoot, journal.commandId);
    const published = yield* responseData(response);
    return {
      command: "presentation publish" as const,
      accepted: true as const,
      projectId: input.document.projectId,
      environmentId: input.document.environmentId,
      environmentKey: input.document.environmentKey,
      collection: input.document.collection,
      commandId: published.commandId,
      replayed: published.replayed,
      noOp: published.noOp,
      revision: published.revision,
      presentation: published.presentation,
    };
  },
);

async function run<A, E>(effect: Effect.Effect<A, E, CredentialStore>) {
  const runtime = ManagedRuntime.make(CredentialStoreLive);
  try {
    return await runtime.runPromise(effect);
  } finally {
    await runtime.dispose();
  }
}

export function runPresentationGetOnline(input: {
  readonly config: CliConfigV2;
  readonly collection: string;
  readonly environmentId: string | null;
}) {
  return run(getPresentationOnline(input));
}

export function runPresentationPublishOnline(input: {
  readonly config: CliConfigV2;
  readonly projectRoot: string;
  readonly document: PresentationEditDocument;
}) {
  return run(publishPresentationOnline(input));
}
