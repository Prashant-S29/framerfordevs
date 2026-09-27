// Store port for encrypted Studio OAuth attempts/sessions and atomic refresh fencing.

import { Data, Effect } from "effect";

export interface StudioCiphertext {
  readonly version: 1;
  readonly keyId: string;
  readonly nonce: string;
  readonly ciphertext: string;
  readonly tag: string;
}

export interface StudioStoreCapabilities {
  readonly shared: boolean;
  readonly durable: boolean;
  readonly atomicRefreshFence: boolean;
}

export class StudioStoreFailure extends Data.TaggedError("StudioStoreFailure")<{
  readonly operation: string;
  readonly reason: "connection" | "timeout" | "command" | "invalid_response";
  readonly cause?: unknown;
}> {}

export interface StudioAttemptRecord {
  readonly attemptDigest: string;
  readonly registrationDigest: string;
  readonly expiresAtEpochMs: number;
  readonly envelope: StudioCiphertext;
}

export interface StudioSessionRecord {
  readonly sessionDigest: string;
  readonly registrationDigest: string;
  readonly expiresAtEpochMs: number;
  readonly generation: number;
  readonly refreshOwner: string | null;
  readonly refreshDispatched: boolean;
  readonly refreshLeaseExpiresAtEpochMs: number | null;
  readonly envelope: StudioCiphertext;
}

export interface CreateAttemptInput {
  readonly record: StudioAttemptRecord;
  readonly nowEpochMs: number;
  readonly maximumAttemptsPerRegistration: number;
}

export interface CreateSessionInput {
  readonly record: StudioSessionRecord;
  readonly nowEpochMs: number;
  readonly maximumSessionsPerRegistration: number;
  /** Atomically removes this prior browser-session digest when re-authenticating. */
  readonly previousSessionDigest?: string;
}

export type AdmissionResult = "created" | "exists" | "quota_exceeded";
export type RefreshClaimResult =
  | Readonly<{ status: "claimed"; record: StudioSessionRecord }>
  | Readonly<{ status: "busy"; generation: number }>
  | Readonly<{ status: "terminal" }>
  | Readonly<{ status: "missing" }>;

export interface StudioRateLimitInput {
  readonly key: string;
  readonly nowEpochMs: number;
  readonly capacity: number;
  readonly intervalMs: number;
}

export interface StudioRateLimitResult {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}

export interface StudioPermitInput {
  readonly key: string;
  readonly owner: string;
  readonly nowEpochMs: number;
  readonly expiresAtEpochMs: number;
  readonly maximum: number;
}

export interface StudioSessionStore {
  readonly capabilities: StudioStoreCapabilities;
  readonly createAttempt: (
    input: CreateAttemptInput,
  ) => Effect.Effect<AdmissionResult, StudioStoreFailure>;
  readonly readAttempt: (
    attemptDigest: string,
    registrationDigest: string,
    nowEpochMs: number,
  ) => Effect.Effect<StudioAttemptRecord | null, StudioStoreFailure>;
  readonly consumeAttempt: (
    attemptDigest: string,
    registrationDigest: string,
    nowEpochMs: number,
  ) => Effect.Effect<StudioAttemptRecord | null, StudioStoreFailure>;
  readonly createSession: (
    input: CreateSessionInput,
  ) => Effect.Effect<AdmissionResult, StudioStoreFailure>;
  readonly readSession: (
    sessionDigest: string,
    registrationDigest: string,
    nowEpochMs: number,
  ) => Effect.Effect<StudioSessionRecord | null, StudioStoreFailure>;
  readonly reencryptSession: (
    sessionDigest: string,
    registrationDigest: string,
    expectedGeneration: number,
    envelope: StudioCiphertext,
  ) => Effect.Effect<boolean, StudioStoreFailure>;
  readonly claimRefresh: (
    sessionDigest: string,
    registrationDigest: string,
    expectedGeneration: number,
    owner: string,
    nowEpochMs: number,
    leaseExpiresAtEpochMs: number,
  ) => Effect.Effect<RefreshClaimResult, StudioStoreFailure>;
  readonly markRefreshDispatched: (
    sessionDigest: string,
    registrationDigest: string,
    expectedGeneration: number,
    owner: string,
  ) => Effect.Effect<boolean, StudioStoreFailure>;
  readonly releaseRefresh: (
    sessionDigest: string,
    registrationDigest: string,
    expectedGeneration: number,
    owner: string,
  ) => Effect.Effect<boolean, StudioStoreFailure>;
  readonly commitRefresh: (
    previousSessionDigest: string,
    expectedGeneration: number,
    owner: string,
    record: StudioSessionRecord,
  ) => Effect.Effect<boolean, StudioStoreFailure>;
  readonly deleteSession: (
    sessionDigest: string,
    registrationDigest: string,
  ) => Effect.Effect<void, StudioStoreFailure>;
  readonly evaluateRateLimit: (
    input: StudioRateLimitInput,
  ) => Effect.Effect<StudioRateLimitResult, StudioStoreFailure>;
  readonly acquirePermit: (input: StudioPermitInput) => Effect.Effect<boolean, StudioStoreFailure>;
  readonly releasePermit: (key: string, owner: string) => Effect.Effect<void, StudioStoreFailure>;
  readonly close: Effect.Effect<void>;
}
