import type {
  CredentialLifecycleStatus,
  CredentialRotationStatus,
} from "../../../contracts/access";

export const credentialRotationOverlapMs = 24 * 60 * 60 * 1_000;

export interface CredentialAuthenticationState {
  readonly status: CredentialLifecycleStatus | string;
  readonly expiresAt: Date | null;
  readonly retireAt: Date | null;
}

/** Evaluates key usability without relying on asynchronous cleanup of expired lifecycle rows. */
export function canCredentialAuthenticate(
  credential: CredentialAuthenticationState,
  now: Date,
): boolean {
  if (credential.expiresAt !== null && credential.expiresAt <= now) return false;
  if (credential.status === "active") return true;
  return (
    credential.status === "retiring" && credential.retireAt !== null && credential.retireAt > now
  );
}

export type CredentialRotationAction = "activate" | "cancel" | "complete";

/** Keeps the staged rotation transition graph closed and explicit. */
export function canChangeCredentialRotation(
  status: CredentialRotationStatus | string,
  action: CredentialRotationAction,
): boolean {
  return (
    (status === "pending" && (action === "activate" || action === "cancel")) ||
    (status === "overlap" && action === "complete")
  );
}

export function credentialRotationRetireAt(activatedAt: Date): Date {
  return new Date(activatedAt.getTime() + credentialRotationOverlapMs);
}
