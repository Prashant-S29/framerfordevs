export const previewCredentialMaximumLifetimeMs = 30 * 24 * 60 * 60 * 1_000;

interface CredentialLifetime {
  readonly family: string;
  readonly expiresAt: Date | null;
  readonly createdAt: Date;
}

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

export function isStoredCredentialLifetimeCompliant(credential: CredentialLifetime): boolean {
  return isCredentialIssueLifetimeCompliant(
    credential.family,
    credential.expiresAt,
    credential.createdAt,
  );
}
