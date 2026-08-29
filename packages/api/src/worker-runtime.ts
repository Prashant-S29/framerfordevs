// Composes the dedicated webhook worker Layer and its single process-lifetime ManagedRuntime.

import { env } from "@framerfordevs/env/server";
import { Layer, ManagedRuntime } from "effect";

import { WebhookTelemetryLive } from "./observability/webhook-telemetry";
import { makeWebhookCryptoLive, WebhookCryptoUnavailableLive } from "./services/webhook/crypto";
import { WebhookDestinationValidatorLive } from "./services/webhook/destination-validator";
import { parseWebhookKeyRing } from "./services/webhook/key-ring";
import { WebhookTransportLive } from "./services/webhook/transport";
import { WebhookWorkerRepositoryLive } from "./services/webhook/worker-repository";

export type WebhookWorkerServices =
  | import("./observability/webhook-telemetry").WebhookTelemetry
  | import("./services/webhook/crypto").WebhookCrypto
  | import("./services/webhook/destination-validator").WebhookDestinationValidator
  | import("./services/webhook/transport").WebhookTransport
  | import("./services/webhook/worker-repository").WebhookWorkerRepository;

const keyRing = parseWebhookKeyRing(
  env.WEBHOOK_ENCRYPTION_ACTIVE_KEY_ID,
  env.WEBHOOK_ENCRYPTION_KEYS,
);
const WebhookCryptoLive =
  keyRing === null ? WebhookCryptoUnavailableLive : makeWebhookCryptoLive(keyRing);

export const WebhookWorkerLive = Layer.mergeAll(
  WebhookCryptoLive,
  WebhookDestinationValidatorLive,
  WebhookTransportLive,
  WebhookWorkerRepositoryLive,
  WebhookTelemetryLive,
);
export const webhookWorkerRuntime = ManagedRuntime.make(WebhookWorkerLive);

export function disposeWebhookWorkerRuntime(): Promise<void> {
  return webhookWorkerRuntime.dispose();
}
