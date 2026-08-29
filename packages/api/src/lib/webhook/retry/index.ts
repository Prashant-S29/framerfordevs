// Classifies bounded webhook outcomes and calculates deterministic equal-jitter retry schedules.

export const webhookMaximumAttempts = 12;
const baseDelaySeconds = 30;
const maximumBackoffSeconds = 6 * 60 * 60;
const maximumRetryAfterSeconds = 24 * 60 * 60;

export type WebhookAttemptOutcome =
  | "succeeded"
  | "retryable_http"
  | "permanent_http"
  | "redirect_rejected"
  | "retryable_network"
  | "security_rejected"
  | "configuration_error"
  | "internal_error";

export interface WebhookOutcomeClassification {
  readonly outcome: WebhookAttemptOutcome;
  readonly retryable: boolean;
}

export function classifyWebhookHttpStatus(status: number): WebhookOutcomeClassification {
  if (status >= 200 && status <= 299) return { outcome: "succeeded", retryable: false };
  if (status >= 300 && status <= 399) return { outcome: "redirect_rejected", retryable: false };
  if (status === 408 || status === 425 || status === 429 || status >= 500) {
    return { outcome: "retryable_http", retryable: true };
  }
  return { outcome: "permanent_http", retryable: false };
}

export function webhookBackoffCapSeconds(attemptNumber: number): number {
  if (
    !Number.isInteger(attemptNumber) ||
    attemptNumber < 1 ||
    attemptNumber > webhookMaximumAttempts
  ) {
    throw new RangeError("Webhook attempt number is outside the retry profile.");
  }
  return Math.min(maximumBackoffSeconds, baseDelaySeconds * 2 ** (attemptNumber - 1));
}

/** Uses injected entropy in [0,1) to produce equal jitter over the upper half of the cap. */
export function webhookEqualJitterSeconds(attemptNumber: number, entropy: number): number {
  if (!Number.isFinite(entropy) || entropy < 0 || entropy >= 1) {
    throw new RangeError("Webhook retry entropy must be in the half-open interval [0, 1). ");
  }
  const cap = webhookBackoffCapSeconds(attemptNumber);
  return Math.floor(cap / 2 + entropy * (cap - cap / 2));
}

export function parseWebhookRetryAfter(
  value: string | undefined,
  nowEpochMs: number,
): number | null {
  if (value === undefined || value.length < 1 || value.length > 128) return null;
  if (/^\d+$/u.test(value)) {
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) ? Math.min(seconds, maximumRetryAfterSeconds) : null;
  }
  const dateEpochMs = Date.parse(value);
  if (!Number.isFinite(dateEpochMs) || dateEpochMs <= nowEpochMs) return null;
  return Math.min(Math.ceil((dateEpochMs - nowEpochMs) / 1_000), maximumRetryAfterSeconds);
}

export function scheduleWebhookRetry(input: {
  readonly attemptNumber: number;
  readonly entropy: number;
  readonly retryAfterSeconds?: number | null;
}): number | null {
  if (input.attemptNumber >= webhookMaximumAttempts) return null;
  const jitter = webhookEqualJitterSeconds(input.attemptNumber, input.entropy);
  const retryAfter =
    input.retryAfterSeconds === undefined || input.retryAfterSeconds === null
      ? 0
      : Math.min(Math.max(0, input.retryAfterSeconds), maximumRetryAfterSeconds);
  return Math.max(jitter, retryAfter);
}
