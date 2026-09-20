const invitationTokenPattern = /^[A-Za-z0-9_-]{43}$/u;

export function parseInvitationTokenHash(hash: string): string | null {
  if (!hash.startsWith("#token=")) return null;
  const token = hash.slice("#token=".length);
  return invitationTokenPattern.test(token) ? token : null;
}

export function buildInvitationLink(origin: string, token: string): string {
  if (!invitationTokenPattern.test(token)) throw new Error("Invalid invitation token.");
  return `${origin}/invitations/accept#token=${token}`;
}

export function buildInvitationAcceptancePath(token: string): string {
  if (!invitationTokenPattern.test(token)) throw new Error("Invalid invitation token.");
  return `/invitations/accept#token=${token}`;
}

export function buildInvitationSignInLink(token: string): string {
  if (!invitationTokenPattern.test(token)) throw new Error("Invalid invitation token.");
  return `/login#token=${token}`;
}
