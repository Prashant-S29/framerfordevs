import { promises as dns } from "node:dns";

import { Context, Effect, Layer } from "effect";

import {
  WebhookDestinationResolutionFailure,
  WebhookDestinationUnsafeFailure,
} from "../../../contracts/response/errors";
import {
  normalizeWebhookDestination,
  validateWebhookDnsAnswers,
} from "../../../lib/webhook/destination";

const dnsTimeoutMs = 2_000;

function resolverAddress(answer: { readonly address: string }): string {
  return answer.address;
}

function resolutionFailure(): WebhookDestinationResolutionFailure {
  return WebhookDestinationResolutionFailure.make();
}

async function resolveWebhookHostname(hostname: string): Promise<ReadonlyArray<string>> {
  return (await dns.lookup(hostname, { all: true, verbatim: true })).map(resolverAddress);
}

export function makeWebhookDestinationValidator(
  resolve: (hostname: string) => Promise<ReadonlyArray<string>> = resolveWebhookHostname,
  resolutionTimeoutMs = dnsTimeoutMs,
) {
  return {
    validate: Effect.fn("WebhookDestinationValidator.validate")(function* (input: string) {
      const normalized = normalizeWebhookDestination(input);
      if (!normalized.ok) return yield* WebhookDestinationUnsafeFailure.make();
      const answers = yield* Effect.tryPromise({
        try: () => resolve(normalized.value.hostname),
        catch: resolutionFailure,
      }).pipe(
        Effect.timeoutOrElse({
          duration: resolutionTimeoutMs,
          orElse: () => Effect.fail(resolutionFailure()),
        }),
      );
      const validated = validateWebhookDnsAnswers(answers);
      if (!validated.ok) return yield* WebhookDestinationUnsafeFailure.make();
      return { ...normalized.value, addresses: validated.value };
    }),
  };
}

export class WebhookDestinationValidator extends Context.Service<
  WebhookDestinationValidator,
  ReturnType<typeof makeWebhookDestinationValidator>
>()("WebhookDestinationValidator") {}

export const WebhookDestinationValidatorLive = Layer.succeed(
  WebhookDestinationValidator,
  makeWebhookDestinationValidator(),
);
