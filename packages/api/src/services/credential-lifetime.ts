// Centralizes the approved expiring-only lifetime policy for environment-wide Preview credentials.

export const previewCredentialMaximumLifetimeMs = 30 * 24 * 60 * 60 * 1_000;

interface CredentialLifetime {
  readonly family: string;
  readonly expiresAt: Date | null;
  readonly createdAt: Date;
}

/** Validates a requested Preview expiry against the server-authoritative issuance instant. */
export function isCredentialIssueLifetimeCompliant(
  family: string,
  expiresAt: Date | null,
  issuedAt: Date,
): boolean {
  if (family !== "preview") return true;
  return (
    expiresAt !== null &&
    expiresAt > issuedAt &&
    expiresAt.getTime() - issuedAt.getTime() <= previewCredentialMaximumLifetimeMs
  );
}

/** Rejects legacy Preview rows whose original lifetime exceeded the approved maximum. */
export function isStoredCredentialLifetimeCompliant(credential: CredentialLifetime): boolean {
  return isCredentialIssueLifetimeCompliant(
    credential.family,
    credential.expiresAt,
    credential.createdAt,
  );
}
