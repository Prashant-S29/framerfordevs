// Defines the receiver's bounded scenario, verification, event, and persisted-capture contracts.

export const scenarioKeys = [
  "success",
  "retry-twice",
  "rate-limit-once",
  "permanent-failure",
  "redirect",
  "slow",
  "idempotent",
] as const;

export type ScenarioKey = (typeof scenarioKeys)[number];

export type VerificationCategory =
  | "verified"
  | "missing_secret"
  | "malformed_headers"
  | "stale_timestamp"
  | "invalid_signature"
  | "invalid_payload";

export interface VerifiedEvent {
  readonly specversion: "1.0";
  readonly id: string;
  readonly source: string;
  readonly type: "cms.schema.published" | "cms.entry.published" | "cms.entry.unpublished";
  readonly subject: string;
  readonly time: string;
  readonly datacontenttype: "application/json";
  readonly data: Readonly<Record<string, unknown>>;
}

export interface VerificationResult {
  readonly ok: boolean;
  readonly category: VerificationCategory;
  readonly event?: VerifiedEvent;
}

export interface SafeWebhookHeaders {
  readonly contentType: string | null;
  readonly contentLength: string | null;
  readonly userAgent: string | null;
  readonly webhookId: string | null;
  readonly webhookTimestamp: string | null;
  readonly webhookDeliveryId: string | null;
  readonly webhookAttemptId: string | null;
  readonly webhookAttemptNumber: number | null;
  readonly webhookReplay: boolean | null;
}

export interface PlannedResponse {
  readonly status: number;
  readonly delayMs: number;
  readonly retryAfter: string | null;
  readonly location: string | null;
  readonly code: string;
  readonly acceptsEvent: boolean;
}

export interface CaptureRecord {
  readonly schemaVersion: 1;
  readonly captureId: string;
  readonly phase: "received" | "responded" | "client_disconnected";
  readonly receivedAt: string;
  readonly completedAt: string | null;
  readonly scenario: ScenarioKey;
  readonly bodyBytes: number;
  readonly bodySha256: string;
  readonly headers: SafeWebhookHeaders;
  readonly verification: {
    readonly ok: boolean;
    readonly category: VerificationCategory;
    readonly duplicateAcceptedEvent: boolean;
  };
  readonly event: VerifiedEvent | null;
  readonly response: PlannedResponse;
}

export interface RuntimeConfig {
  readonly port: number;
  readonly dataDir: string;
  readonly secretsDir: string;
  readonly maximumBodyBytes: number;
  readonly timestampToleranceSeconds: number;
}
