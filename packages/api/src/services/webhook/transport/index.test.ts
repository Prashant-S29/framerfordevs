import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { makeWebhookDestinationValidator } from "../destination-validator";
import {
  makeWebhookTransport,
  type WebhookHttpsAdapter,
  type WebhookHttpsOptions,
  type WebhookTimeoutScheduler,
} from "./index";

const request = {
  url: "https://hooks.example.test/callback?token=opaque",
  hostname: "hooks.example.test",
  address: "93.184.216.34",
  body: Buffer.from("canonical-body", "utf8"),
  headers: { "content-type": "application/cloudevents+json" },
  connectTimeoutMs: 30,
  timeoutMs: 100,
};

describe("Webhook pinned HTTPS transport", () => {
  it.effect(
    "pins the validated address, preserves TLS authority, and discards response bytes",
    () => {
      let options: WebhookHttpsOptions | undefined;
      let endedBody: Uint8Array | undefined;
      let responseDestroyed = false;
      const adapter: WebhookHttpsAdapter = {
        request: (nextOptions, onResponse, _onError, _onTimeout, onSecureConnect) => {
          options = nextOptions;
          return {
            end: (body) => {
              endedBody = body;
              onSecureConnect();
              onResponse({
                statusCode: 503,
                headers: { "retry-after": ["120"] },
                destroy: () => {
                  responseDestroyed = true;
                },
              });
            },
            destroy: () => undefined,
          };
        },
      };

      return Effect.gen(function* () {
        const response = yield* makeWebhookTransport(adapter).send(request);
        assert.deepStrictEqual(response, { status: 503, retryAfter: "120" });
        assert.strictEqual(options?.hostname, "hooks.example.test");
        assert.strictEqual(options?.servername, "hooks.example.test");
        assert.strictEqual(options?.path, "/callback?token=opaque");
        assert.strictEqual(options?.agent.options.keepAlive, false);
        assert.strictEqual(options?.agent.options.maxCachedSessions, 100);
        assert.deepStrictEqual(endedBody, request.body);
        assert.isTrue(responseDestroyed);
        let lookupResult: { address: string; family: 4 | 6 } | undefined;
        options?.lookup("ignored.example", {}, (_error, address, family) => {
          if (typeof address === "string" && family !== undefined) {
            lookupResult = { address, family };
          }
        });
        assert.deepStrictEqual(lookupResult, { address: "93.184.216.34", family: 4 });
        let allLookupResult:
          | ReadonlyArray<{ readonly address: string; readonly family: 4 | 6 }>
          | undefined;
        options?.lookup("ignored.example", { all: true }, (_error, address) => {
          if (typeof address !== "string") allLookupResult = address;
        });
        assert.deepStrictEqual(allLookupResult, [{ address: "93.184.216.34", family: 4 }]);
      });
    },
  );

  it.effect("pins the send-time DNS result even if the resolver later rebinds", () => {
    let resolutionCount = 0;
    let connectedAddress: string | undefined;
    const validator = makeWebhookDestinationValidator(async () => {
      resolutionCount += 1;
      return resolutionCount === 1 ? ["93.184.216.34"] : ["169.254.169.254"];
    });
    const adapter: WebhookHttpsAdapter = {
      request: (options, onResponse, _onError, _onTimeout, onSecureConnect) => ({
        end: () => {
          options.lookup("rebound.example", {}, (_error, address) => {
            if (typeof address === "string") connectedAddress = address;
          });
          onSecureConnect();
          onResponse({ statusCode: 204, headers: {}, destroy: () => undefined });
        },
        destroy: () => undefined,
      }),
    };
    return Effect.gen(function* () {
      const validated = yield* validator.validate("https://hooks.example.test/callback");
      const address = validated.addresses[0];
      assert.isDefined(address);
      if (address === undefined) return;
      const response = yield* makeWebhookTransport(adapter).send({
        ...request,
        address,
      });
      assert.strictEqual(response.status, 204);
      assert.strictEqual(resolutionCount, 1);
      assert.strictEqual(connectedAddress, "93.184.216.34");
    });
  });

  it.effect("maps socket failures to a fixed transport operation", () => {
    const adapter: WebhookHttpsAdapter = {
      request: (_options, _onResponse, onError) => ({
        end: () => onError(new Error("sensitive network detail")),
        destroy: () => undefined,
      }),
    };
    return Effect.gen(function* () {
      const failure = yield* Effect.flip(makeWebhookTransport(adapter).send(request));
      assert.strictEqual(failure._tag, "SecurityServiceFailure");
      assert.strictEqual(failure.operation, "webhook.transport.send");
    });
  });

  it.effect("enforces the independent TLS-connect deadline before the total timeout", () => {
    const scheduled: Array<{
      readonly callback: () => void;
      readonly milliseconds: number;
      cleared: boolean;
    }> = [];
    const scheduleTimeout: WebhookTimeoutScheduler = (callback, milliseconds) => {
      const state = { callback, milliseconds, cleared: false };
      scheduled.push(state);
      return {
        clear: () => {
          state.cleared = true;
        },
        unref: () => undefined,
      };
    };
    const adapter: WebhookHttpsAdapter = {
      request: (_options, _onResponse, onError) => ({
        end: () => {
          scheduled
            .find((timeout) => timeout.milliseconds === request.connectTimeoutMs)
            ?.callback();
        },
        destroy: (cause) => onError(cause),
      }),
    };
    return Effect.gen(function* () {
      const failure = yield* Effect.flip(
        makeWebhookTransport(adapter, scheduleTimeout).send(request),
      );
      assert.strictEqual(failure.operation, "webhook.transport.send");
      assert.deepStrictEqual(
        scheduled.map(({ milliseconds }) => milliseconds),
        [request.connectTimeoutMs, request.timeoutMs],
      );
      assert.isTrue(scheduled.every((timeout) => timeout.cleared));
    });
  });

  it.effect("enforces socket timeout without following redirects or reading a body", () => {
    let destroyCalls = 0;
    const adapter: WebhookHttpsAdapter = {
      request: (_options, _onResponse, onError, onTimeout) => ({
        end: () => onTimeout(),
        destroy: (cause) => {
          destroyCalls += 1;
          onError(cause);
        },
      }),
    };
    return Effect.gen(function* () {
      const failure = yield* Effect.flip(makeWebhookTransport(adapter).send(request));
      assert.strictEqual(failure.operation, "webhook.transport.send");
      assert.strictEqual(destroyCalls, 1);
    });
  });

  it.effect("uses a bounded unknown-status fallback without response content", () => {
    const adapter: WebhookHttpsAdapter = {
      request: (_options, onResponse) => ({
        end: () => onResponse({ headers: {}, destroy: () => undefined }),
        destroy: () => undefined,
      }),
    };
    return Effect.gen(function* () {
      assert.deepStrictEqual(yield* makeWebhookTransport(adapter).send(request), {
        status: 599,
        retryAfter: undefined,
      });
    });
  });
});
