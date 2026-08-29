import { assert, describe, it } from "@effect/vitest";
import { Effect, Fiber, Layer, Schema, TestClock } from "effect";

import { CredentialStore, StoredOAuthAuthority, makeCredentialStore } from "./credential-store";
import {
  BrowserOpener,
  DeviceAuthorizationPresenter,
  getValidAccessToken,
  loginWithDeviceAuthorization,
} from "./oauth-device";

function success(value: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

function services(options?: { browser?: Array<string>; presented?: Array<string> }) {
  const values = new Map<string, string>();
  const store = makeCredentialStore((_service, account) => ({
    setPassword: (value) => {
      values.set(account, value);
      return Promise.resolve();
    },
    getPassword: () => Promise.resolve(values.get(account)),
    deletePassword: () => Promise.resolve(values.delete(account)),
  }));
  return {
    values,
    layer: Layer.mergeAll(
      Layer.succeed(CredentialStore, store),
      Layer.succeed(DeviceAuthorizationPresenter, {
        present: (value) =>
          Effect.sync(() => {
            options?.presented?.push(value.userCode);
          }),
      }),
      Layer.succeed(BrowserOpener, {
        open: (url) =>
          Effect.sync(() => {
            options?.browser?.push(url);
          }),
      }),
    ),
  };
}

const deviceResponse = {
  device_code: "device-secret",
  user_code: "ABCD-EFGH",
  verification_uri: "https://developers.example.com/device",
  verification_uri_complete: "https://developers.example.com/device?user_code=ABCD-EFGH",
  expires_in: 600,
  interval: 5,
};
const flushAsync = Effect.promise(() => new Promise<void>((resolve) => setImmediate(resolve)));

const tokenResponse = {
  access_token: "access-secret",
  refresh_token: "refresh-secret",
  id_token: "id-token",
  token_type: "Bearer",
  expires_in: 600,
  expires_at: 610,
  scope: "openid tooling:read offline_access",
};

describe("OAuth device CLI flow", () => {
  it.effect(
    "presents the code, polls no faster than instructed, and stores only in keychain",
    () => {
      const presented: Array<string> = [];
      const browser: Array<string> = [];
      const dependencies = services({ presented, browser });
      let polls = 0;
      let requestedScope = "";
      const fetch: typeof globalThis.fetch = (input, init) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("/device/code")) {
          const body: unknown = JSON.parse(String(init?.body));
          const scope =
            typeof body === "object" && body !== null ? Reflect.get(body, "scope") : undefined;
          requestedScope = typeof scope === "string" ? scope : "";
          return success(deviceResponse);
        }
        polls += 1;
        return polls === 1
          ? success({ error: "authorization_pending" }, 400)
          : success(tokenResponse);
      };
      return Effect.gen(function* () {
        const fiber = yield* Effect.fork(
          loginWithDeviceAuthorization({
            apiOrigin: "https://api.example.com",
            openBrowser: false,
            fetch,
          }),
        );
        yield* flushAsync;
        assert.deepEqual(presented, ["ABCD-EFGH"]);
        assert.strictEqual(
          requestedScope,
          "openid profile offline_access tooling:read authoring:read authoring:draft:write authoring:content:publish authoring:schema:push",
        );
        assert.deepEqual(browser, []);
        assert.strictEqual(polls, 0);
        yield* TestClock.adjust("5 seconds");
        yield* flushAsync;
        assert.strictEqual(polls, 1);
        yield* TestClock.adjust("5 seconds");
        yield* flushAsync;
        const result = yield* Fiber.join(fiber);

        assert.strictEqual(polls, 2);
        assert.strictEqual(result.expiresAtEpochSeconds, 610);
        assert.strictEqual(dependencies.values.size, 1);
        assert.include([...dependencies.values.values()][0] ?? "", "refresh-secret");
      }).pipe(Effect.provide(dependencies.layer));
    },
  );

  it.effect("opens a browser only after explicit intent", () => {
    const browser: Array<string> = [];
    const dependencies = services({ browser });
    const fetch: typeof globalThis.fetch = (input) => {
      const url = new URL(String(input));
      return url.pathname.endsWith("/device/code")
        ? success(deviceResponse)
        : success(tokenResponse);
    };
    return Effect.gen(function* () {
      const fiber = yield* Effect.fork(
        loginWithDeviceAuthorization({
          apiOrigin: "https://api.example.com",
          openBrowser: true,
          fetch,
        }),
      );
      yield* flushAsync;
      assert.deepEqual(browser, [deviceResponse.verification_uri_complete]);
      yield* TestClock.adjust("5 seconds");
      yield* flushAsync;
      yield* Fiber.join(fiber);
    }).pipe(Effect.provide(dependencies.layer));
  });

  it.effect("rotates an expired refresh token before returning access authority", () => {
    const dependencies = services();
    let refreshBody = "";
    const fetch: typeof globalThis.fetch = (_input, init) => {
      refreshBody = String(init?.body ?? "");
      return success({
        ...tokenResponse,
        access_token: "rotated-access",
        refresh_token: "rotated-refresh",
      });
    };
    return Effect.gen(function* () {
      const store = yield* CredentialStore;
      yield* store.save(
        "https://api.example.com",
        Schema.decodeUnknownSync(StoredOAuthAuthority)({
          version: 1,
          accessToken: "expired-access",
          refreshToken: "old-refresh",
          accessExpiresAtEpochSeconds: 0,
        }),
      );
      const access = yield* getValidAccessToken({
        apiOrigin: "https://api.example.com",
        fetch,
      });
      const rotated = yield* store.load("https://api.example.com");

      assert.strictEqual(access, "rotated-access");
      assert.include(refreshBody, "grant_type=refresh_token");
      assert.include(refreshBody, "refresh_token=old-refresh");
      assert.strictEqual(rotated?.refreshToken, "rotated-refresh");
    }).pipe(Effect.provide(dependencies.layer));
  });
});
