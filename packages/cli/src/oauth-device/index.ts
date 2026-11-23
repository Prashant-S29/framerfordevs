import { spawn } from "node:child_process";

import { Clock, Context, Duration, Effect, Layer, Schema } from "effect";

import { CredentialStore, StoredOAuthAuthority } from "../credential-store";
import {
  OAuthBrowserOpenError,
  OAuthDeviceError,
  ToolingResponseTooLargeError,
  ToolingTransportError,
} from "../errors";

const clientId = "framerfordevs-cli";
const scope =
  "openid profile offline_access tooling:read authoring:read authoring:draft:write authoring:content:publish authoring:schema:push authoring:presentation:publish control-plane:read control-plane:write control-plane:project:lifecycle control-plane:governance:read control-plane:governance:write control-plane:operations:read control-plane:operations:write control-plane:security:read";
const deviceGrant = "urn:ietf:params:oauth:grant-type:device_code";
const maximumResponseBytes = 64 * 1_024;
const requestTimeoutMs = 15_000;

const DeviceAuthorization = Schema.Struct({
  device_code: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2_048)),
  user_code: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  verification_uri: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2_048)),
  verification_uri_complete: Schema.optionalKey(
    Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2_048)),
  ),
  expires_in: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 1_800 })),
  interval: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 60 })),
});

const TokenResponse = Schema.Struct({
  access_token: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(16_384)),
  refresh_token: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(16_384)),
  id_token: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(16_384))),
  token_type: Schema.Literal("Bearer"),
  expires_in: Schema.Number.check(
    Schema.isInt(),
    Schema.isBetween({ minimum: 1, maximum: 86_400 }),
  ),
  expires_at: Schema.optionalKey(
    Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  ),
  scope: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512))),
});

const OAuthErrorResponse = Schema.Struct({
  error: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  error_description: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(512))),
});

export interface DeviceAuthorizationPresentation {
  readonly userCode: string;
  readonly verificationUri: string;
  readonly expiresInSeconds: number;
}

export interface DeviceAuthorizationPresenterService {
  readonly present: (value: DeviceAuthorizationPresentation) => Effect.Effect<void, never>;
}

export class DeviceAuthorizationPresenter extends Context.Service<
  DeviceAuthorizationPresenter,
  DeviceAuthorizationPresenterService
>()("DeviceAuthorizationPresenter") {}

export interface BrowserOpenerService {
  readonly open: (url: string) => Effect.Effect<void, OAuthBrowserOpenError>;
}

export class BrowserOpener extends Context.Service<BrowserOpener, BrowserOpenerService>()(
  "BrowserOpener",
) {}

function openBrowser(url: string): Promise<void> {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" &&
    !(
      parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
    )
  ) {
    return Promise.reject(new Error("Browser URL is unsafe."));
  }
  const [command, arguments_] =
    process.platform === "darwin"
      ? ["open", [parsed.toString()]]
      : process.platform === "win32"
        ? ["rundll32", ["url.dll,FileProtocolHandler", parsed.toString()]]
        : ["xdg-open", [parsed.toString()]];
  return new Promise((resolve, reject) => {
    const environment = { ...process.env };
    delete environment["FFD_MANAGEMENT_TOKEN"];
    const child = spawn(command, arguments_, {
      detached: true,
      stdio: "ignore",
      shell: false,
      env: environment,
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

export const BrowserOpenerLive = Layer.succeed(BrowserOpener, {
  open: (url) =>
    Effect.tryPromise({
      try: () => openBrowser(url),
      catch: () => OAuthBrowserOpenError.make(),
    }),
});

async function boundedJson(response: Response): Promise<unknown> {
  const length = response.headers.get("content-length");
  if (length !== null && Number(length) > maximumResponseBytes) {
    throw ToolingResponseTooLargeError.make();
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maximumResponseBytes) throw ToolingResponseTooLargeError.make();
  return JSON.parse(Buffer.from(bytes).toString("utf8"));
}

export interface OAuthDeviceClientOptions {
  readonly apiOrigin: string;
  readonly fetch?: typeof globalThis.fetch;
}

export function makeOAuthDeviceClient(options: OAuthDeviceClientOptions) {
  const origin = new URL(options.apiOrigin).origin;
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const resource = new URL("/api/tooling/v1", origin).toString();

  const post = (path: string, body: string | URLSearchParams, contentType: string) =>
    Effect.tryPromise({
      try: () =>
        fetchImplementation(new URL(path, origin), {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": contentType },
          body,
          redirect: "error",
          signal: AbortSignal.timeout(requestTimeoutMs),
        }),
      catch: (cause) => ToolingTransportError.make({ operation: "oauth.device.fetch", cause }),
    });

  const decodeError = (status: number, value: unknown) =>
    Schema.decodeUnknownEffect(OAuthErrorResponse, { onExcessProperty: "error" })(value, {
      onExcessProperty: "error",
    }).pipe(
      Effect.map((failure) =>
        OAuthDeviceError.make({
          code: failure.error,
          retryable:
            failure.error === "authorization_pending" ||
            failure.error === "slow_down" ||
            status >= 500,
        }),
      ),
      Effect.catch(() =>
        Effect.succeed(OAuthDeviceError.make({ code: "oauth_response_invalid", retryable: false })),
      ),
    );

  const tokenRequest = (parameters: URLSearchParams) =>
    Effect.gen(function* () {
      const response = yield* post(
        "/api/auth/oauth2/token",
        parameters,
        "application/x-www-form-urlencoded",
      );
      const value = yield* Effect.tryPromise({
        try: () => boundedJson(response),
        catch: (cause) => ToolingTransportError.make({ operation: "oauth.device.response", cause }),
      });
      if (!response.ok) return yield* yield* decodeError(response.status, value);
      return yield* Schema.decodeUnknownEffect(TokenResponse, { onExcessProperty: "error" })(
        value,
        {
          onExcessProperty: "error",
        },
      ).pipe(
        Effect.mapError(() =>
          OAuthDeviceError.make({ code: "oauth_response_invalid", retryable: false }),
        ),
      );
    });

  return {
    authorize: Effect.gen(function* () {
      const response = yield* post(
        "/api/auth/device/code",
        JSON.stringify({ client_id: clientId, scope, resource }),
        "application/json",
      );
      const value = yield* Effect.tryPromise({
        try: () => boundedJson(response),
        catch: (cause) => ToolingTransportError.make({ operation: "oauth.device.response", cause }),
      });
      if (!response.ok) return yield* yield* decodeError(response.status, value);
      return yield* Schema.decodeUnknownEffect(DeviceAuthorization, { onExcessProperty: "error" })(
        value,
        {
          onExcessProperty: "error",
        },
      ).pipe(
        Effect.mapError(() =>
          OAuthDeviceError.make({ code: "oauth_response_invalid", retryable: false }),
        ),
      );
    }),
    poll: (deviceCode: string) =>
      tokenRequest(
        new URLSearchParams({
          grant_type: deviceGrant,
          device_code: deviceCode,
          client_id: clientId,
        }),
      ),
    refresh: (refreshToken: string) =>
      tokenRequest(
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: clientId,
          resource,
        }),
      ),
  };
}

export const loginWithDeviceAuthorization = Effect.fn("OAuthDevice.login")(function* (options: {
  readonly apiOrigin: string;
  readonly openBrowser: boolean;
  readonly fetch?: typeof globalThis.fetch;
}) {
  const client = makeOAuthDeviceClient(options);
  const authorization = yield* client.authorize;
  const presenter = yield* DeviceAuthorizationPresenter;
  yield* presenter.present({
    userCode: authorization.user_code,
    verificationUri: authorization.verification_uri,
    expiresInSeconds: authorization.expires_in,
  });
  if (options.openBrowser) {
    const browser = yield* BrowserOpener;
    yield* browser.open(authorization.verification_uri_complete ?? authorization.verification_uri);
  }
  const startedAt = yield* Clock.currentTimeMillis;
  let intervalSeconds = authorization.interval;
  while (true) {
    const now = yield* Clock.currentTimeMillis;
    if (now - startedAt >= authorization.expires_in * 1_000) {
      return yield* OAuthDeviceError.make({ code: "expired_token", retryable: false });
    }
    yield* Effect.sleep(Duration.seconds(intervalSeconds));
    const result = yield* Effect.result(client.poll(authorization.device_code));
    if (result._tag === "Success") {
      const token = result.success;
      const currentEpochSeconds = Math.floor((yield* Clock.currentTimeMillis) / 1_000);
      const authority = StoredOAuthAuthority.make({
        version: 1,
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        accessExpiresAtEpochSeconds: token.expires_at ?? currentEpochSeconds + token.expires_in,
      });
      yield* (yield* CredentialStore).save(options.apiOrigin, authority);
      return { expiresAtEpochSeconds: authority.accessExpiresAtEpochSeconds };
    }
    const failure = result.failure;
    if (failure._tag !== "OAuthDeviceError") return yield* failure;
    if (failure.code === "authorization_pending") continue;
    if (failure.code === "slow_down") {
      intervalSeconds = Math.min(60, intervalSeconds + 5);
      continue;
    }
    return yield* failure;
  }
});

export const getValidAccessToken = Effect.fn("OAuthDevice.accessToken")(function* (options: {
  readonly apiOrigin: string;
  readonly fetch?: typeof globalThis.fetch;
}) {
  const store = yield* CredentialStore;
  const authority = yield* store.load(options.apiOrigin);
  if (authority === null)
    return yield* OAuthDeviceError.make({ code: "login_required", retryable: false });
  const now = Math.floor((yield* Clock.currentTimeMillis) / 1_000);
  if (authority.accessExpiresAtEpochSeconds > now + 30) return authority.accessToken;
  const token = yield* makeOAuthDeviceClient(options).refresh(authority.refreshToken);
  const rotated = StoredOAuthAuthority.make({
    version: 1,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    accessExpiresAtEpochSeconds: token.expires_at ?? now + token.expires_in,
  });
  yield* store.save(options.apiOrigin, rotated);
  return rotated.accessToken;
});
