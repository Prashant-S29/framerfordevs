import { assert, describe, it } from "@effect/vitest";
import { Schema } from "effect";

import { ApiCredentialId } from "../contracts/access";
import { CmsActor } from "../contracts/authoring";
import { AuthUserId } from "../contracts/platform";
import { cmsActorMatches, cmsActorReferences, cmsAuditActor, normalizeCmsActor } from "./cms-actor";

const userId = Schema.decodeUnknownSync(AuthUserId)("m13-actor-user");
const credentialId = Schema.decodeUnknownSync(ApiCredentialId)(
  "019fae8b-1234-7000-8000-000000000301",
);
const credential = Schema.decodeUnknownSync(CmsActor)({
  kind: "credential",
  id: credentialId,
});

describe("CMS actor attribution", () => {
  it("preserves user callers through the compatibility input", () => {
    assert.deepStrictEqual(normalizeCmsActor(userId), { kind: "user", id: userId });
    assert.deepStrictEqual(cmsActorReferences(userId), {
      userId,
      credentialId: null,
    });
    assert.deepStrictEqual(cmsAuditActor(userId), {
      actorType: "user",
      actorId: userId,
    });
  });

  it("projects credential attribution without issuer impersonation", () => {
    assert.deepStrictEqual(cmsActorReferences(credential), {
      userId: null,
      credentialId,
    });
    assert.deepStrictEqual(cmsAuditActor(credential), {
      actorType: "credential",
      actorId: credentialId,
    });
  });

  it("requires exact actor kind and ID for command replay", () => {
    assert.isTrue(
      cmsActorMatches(credential, {
        userId: null,
        credentialId,
      }),
    );
    assert.isFalse(
      cmsActorMatches(userId, {
        userId: null,
        credentialId,
      }),
    );
  });
});
