// Exposes strict publication-event projection through a replaceable Effect service.

import { Context, Effect, Layer } from "effect";

import { WebhookEventInvalidFailure } from "../contracts/errors";
import { projectPublicationEvent, type PublicationOutboxRecord } from "../lib/publication-event";

export function makeWebhookEventProjector() {
  return {
    project: Effect.fn("WebhookEventProjector.project")((record: PublicationOutboxRecord) =>
      Effect.sync(() => projectPublicationEvent(record)).pipe(
        Effect.flatMap((result) =>
          result.ok ? Effect.succeed(result.value) : Effect.fail(WebhookEventInvalidFailure.make()),
        ),
      ),
    ),
  };
}

export class WebhookEventProjector extends Context.Tag("WebhookEventProjector")<
  WebhookEventProjector,
  ReturnType<typeof makeWebhookEventProjector>
>() {}

export const WebhookEventProjectorLive = Layer.succeed(
  WebhookEventProjector,
  makeWebhookEventProjector(),
);
