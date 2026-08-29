import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit, Schema } from "effect";

import { makeCredentialStore, StoredOAuthAuthority } from "./index";

function memoryStore() {
  const values = new Map<string, string>();
  const accounts: Array<string> = [];
  const store = makeCredentialStore((_service, account) => {
    accounts.push(account);
    return {
      setPassword: (value) => {
        values.set(account, value);
        return Promise.resolve();
      },
      getPassword: () => Promise.resolve(values.get(account)),
      deletePassword: () => Promise.resolve(values.delete(account)),
    };
  });
  return { store, values, accounts };
}

const authority = Schema.decodeUnknownSync(StoredOAuthAuthority)({
  version: 1,
  accessToken: "access-secret",
  refreshToken: "refresh-secret",
  accessExpiresAtEpochSeconds: 1_900_000_000,
});

describe("native credential store", () => {
  it.effect("round-trips authority under an origin-derived non-secret account", () =>
    Effect.gen(function* () {
      const memory = memoryStore();
      yield* memory.store.save("https://api.example.com", authority);
      const loaded = yield* memory.store.load("https://api.example.com/");

      assert.deepEqual(loaded, authority);
      assert.isFalse(memory.accounts[0]?.includes("access-secret"));
      assert.isFalse(memory.accounts[0]?.includes("api.example.com"));
      assert.strictEqual(memory.values.size, 1);
    }),
  );

  it.effect("rejects malformed stored data rather than accepting plaintext fallback", () =>
    Effect.gen(function* () {
      const memory = memoryStore();
      yield* memory.store.save("https://api.example.com", authority);
      const account = memory.accounts[0];
      if (account === undefined) throw new Error("Account was not created.");
      memory.values.set(account, JSON.stringify({ ...authority, extra: "secret" }));
      const malformed = yield* Effect.exit(memory.store.load("https://api.example.com"));

      assert.isTrue(Exit.isFailure(malformed));
    }),
  );

  it.effect("surfaces native keychain unavailability and never writes a file", () => {
    const unavailable = makeCredentialStore(() => ({
      setPassword: () => Promise.reject(new Error("keychain unavailable")),
      getPassword: () => Promise.reject(new Error("keychain unavailable")),
      deletePassword: () => Promise.reject(new Error("keychain unavailable")),
    }));
    return Effect.gen(function* () {
      const saved = yield* Effect.exit(unavailable.save("https://api.example.com", authority));
      const loaded = yield* Effect.exit(unavailable.load("https://api.example.com"));

      assert.isTrue(Exit.isFailure(saved));
      assert.isTrue(Exit.isFailure(loaded));
    });
  });
});
