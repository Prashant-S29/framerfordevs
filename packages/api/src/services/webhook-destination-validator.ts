// Resolves webhook hostnames and applies all-address SSRF policy without making an HTTP request.

import { promises as dns } from "node:dns";

import { Context, Effect, Layer } from "effect";

import {
  WebhookDestinationResolutionFailure,
  WebhookDestinationUnsafeFailure,
} from "../contracts/errors";
import { normalizeWebhookDestination, validateWebhookDnsAnswers } from "../lib/webhook-destination";

const dnsTimeoutMs = 2_000;

/** Projects one runtime resolver answer into the address consumed by the pure policy. */
function resolverAddress(answer: { readonly address: string }): string {
  return answer.address;
}

/** Produces the fixed typed failure used for resolver rejection and timeout. */
function resolutionFailure(): WebhookDestinationResolutionFailure {
  return WebhookDestinationResolutionFailure.make();
}

/** Resolves one hostname through the runtime resolver and returns every candidate address. */
async function resolveWebhookHostname(hostname: string): Promise<ReadonlyArray<string>> {
  return (await dns.lookup(hostname, { all: true, verbatim: true })).map(resolverAddress);
}

/** Builds a validator that bounds DNS work and keeps resolver failures distinct from unsafe answers. */
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
        Effect.timeoutFail({
          duration: resolutionTimeoutMs,
          onTimeout: resolutionFailure,
        }),
      );
      const validated = validateWebhookDnsAnswers(answers);
      if (!validated.ok) return yield* WebhookDestinationUnsafeFailure.make();
      return { ...normalized.value, addresses: validated.value };
    }),
  };
}

export class WebhookDestinationValidator extends Context.Tag("WebhookDestinationValidator")<
  WebhookDestinationValidator,
  ReturnType<typeof makeWebhookDestinationValidator>
>() {}

export const WebhookDestinationValidatorLive = Layer.succeed(
  WebhookDestinationValidator,
  makeWebhookDestinationValidator(),
);
