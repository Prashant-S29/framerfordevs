import { describe, expect, it } from "vitest";

import {
  buildInvitationAcceptancePath,
  buildInvitationLink,
  buildInvitationSignInLink,
  parseInvitationTokenHash,
} from "./index";

const token = "A".repeat(43);

describe("invitation link safety", () => {
  it("keeps invitation tokens in URL fragments instead of query parameters", () => {
    const invitation = new URL(buildInvitationLink("https://app.example.test", token));
    const signIn = new URL(buildInvitationSignInLink(token), "https://app.example.test");
    const acceptance = new URL(buildInvitationAcceptancePath(token), "https://app.example.test");

    expect(invitation.search).toBe("");
    expect(signIn.search).toBe("");
    expect(acceptance.search).toBe("");
    expect(invitation.hash).toBe(`#token=${token}`);
    expect(signIn.hash).toBe(`#token=${token}`);
    expect(acceptance.hash).toBe(`#token=${token}`);
  });

  it("strictly parses valid fragments and rejects malformed or oversized values", () => {
    expect(parseInvitationTokenHash(`#token=${token}`)).toBe(token);
    expect(parseInvitationTokenHash(`?token=${token}`)).toBeNull();
    expect(parseInvitationTokenHash("#token=short")).toBeNull();
    expect(parseInvitationTokenHash(`#token=${"A".repeat(44)}`)).toBeNull();
    expect(parseInvitationTokenHash(`#other=${token}`)).toBeNull();
  });

  it("refuses to construct links from malformed tokens", () => {
    expect(() => buildInvitationLink("https://app.example.test", "invalid")).toThrow(
      "Invalid invitation token.",
    );
  });
});
