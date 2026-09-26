import { describe, expect, it } from "vitest";

import { createStudioOAuthHarness, StudioOAuthHarnessError } from "./index";

const configuration = {
  issuer: "https://api.example.test/api/auth",
  dashboardOrigin: "https://dashboard.example.test",
  clientId: "ffd-studio-v1-018f47b2-9c6a-7c41-8b65-2e45197b1712",
  redirectUri: "http://127.0.0.1:43127/studio/auth/callback",
  resource: "https://api.example.test/api/studio/v1",
  bootstrapUrl:
    "https://api.example.test/api/studio/v1/projects/project-id/environments/environment-id/bootstrap",
};

describe("Studio OAuth test harness", () => {
  it("creates only the exact public Code + S256 PKCE authorization request", () => {
    const harness = createStudioOAuthHarness(configuration);
    const attempt = harness.begin();
    const authorizationUrl = new URL(attempt.authorizationUrl);

    expect(authorizationUrl.origin).toBe("https://api.example.test");
    expect(authorizationUrl.pathname).toBe("/api/auth/oauth2/authorize");
    expect(Object.fromEntries(authorizationUrl.searchParams)).toEqual({
      response_type: "code",
      client_id: configuration.clientId,
      redirect_uri: configuration.redirectUri,
      scope: "studio:session offline_access",
      resource: configuration.resource,
      state: attempt.state,
      code_challenge: attempt.codeChallenge,
      code_challenge_method: "S256",
      prompt: "consent",
    });
    expect(attempt.state).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(attempt.codeVerifier).toMatch(/^[A-Za-z0-9_-]{86}$/u);
    expect(attempt.codeChallenge).toMatch(/^[A-Za-z0-9_-]{43}$/u);
  });

  it("accepts only signed exact dashboard continuation routes", () => {
    const harness = createStudioOAuthHarness(configuration);
    const login = harness.continuation(
      "https://dashboard.example.test/login?client_id=fixed&ba_param=client_id&sig=signed",
      "login",
    );
    const consent = harness.continuation(
      "https://dashboard.example.test/oauth/consent?client_id=fixed&ba_param=client_id&sig=signed",
      "consent",
    );

    expect(login.page).toBe("login");
    expect(consent.page).toBe("consent");
    expect(harness.continueBody(login)).toEqual({
      postLogin: true,
      oauth_query: login.oauthQuery,
    });
    expect(harness.consentBody(consent, true)).toEqual({
      accept: true,
      oauth_query: consent.oauthQuery,
    });
    expect(() =>
      harness.continuation(
        "https://attacker.example.test/oauth/consent?ba_param=x&sig=signed",
        "consent",
      ),
    ).toThrowError(StudioOAuthHarnessError);
  });

  it("validates exact callback binding and creates a secret-free token request", () => {
    const harness = createStudioOAuthHarness(configuration);
    const attempt = harness.begin();
    const callback = harness.callback(
      `${configuration.redirectUri}?code=single-use-code&state=${attempt.state}&iss=${encodeURIComponent(configuration.issuer)}`,
      attempt,
    );
    const tokenBody = harness.tokenBody(callback, attempt);

    expect(callback).toEqual({ code: "single-use-code", issuer: configuration.issuer });
    expect(Object.fromEntries(tokenBody)).toEqual({
      grant_type: "authorization_code",
      code: "single-use-code",
      client_id: configuration.clientId,
      redirect_uri: configuration.redirectUri,
      code_verifier: attempt.codeVerifier,
      resource: configuration.resource,
    });
    expect(tokenBody.has("client_secret")).toBe(false);
    expect(() =>
      harness.callback(
        `${configuration.redirectUri}?code=single-use-code&state=wrong&iss=${encodeURIComponent(configuration.issuer)}`,
        attempt,
      ),
    ).toThrowError(expect.objectContaining({ code: "state_invalid" }));
  });

  it("bounds token responses and builds a no-redirect bootstrap request", () => {
    const harness = createStudioOAuthHarness(configuration);
    const token = harness.decodeTokenResponse({
      access_token: "access-token",
      refresh_token: "refresh-token",
      token_type: "Bearer",
      expires_in: 300,
      scope: "studio:session offline_access",
    });
    const bootstrap = harness.bootstrapRequest(token.accessToken);

    expect(token.expiresIn).toBe(300);
    expect(bootstrap.method).toBe("GET");
    expect(bootstrap.redirect).toBe("error");
    expect(bootstrap.headers.get("authorization")).toBe("Bearer access-token");
    expect(() =>
      harness.decodeTokenResponse({
        access_token: "access-token",
        refresh_token: "refresh-token",
        token_type: "Bearer",
        expires_in: 301,
        scope: "studio:session offline_access",
      }),
    ).toThrowError(expect.objectContaining({ code: "token_response_invalid" }));
  });

  it("allows HTTP only for a fully loopback local conformance fixture", () => {
    expect(() =>
      createStudioOAuthHarness({
        ...configuration,
        issuer: "http://localhost:3000/api/auth",
        dashboardOrigin: "http://localhost:3001",
        resource: "http://localhost:3000/api/studio/v1",
        bootstrapUrl:
          "http://localhost:3000/api/studio/v1/projects/project-id/environments/environment-id/bootstrap",
      }),
    ).not.toThrow();
  });

  it("rejects non-loopback callbacks and caller-selected client families", () => {
    expect(() =>
      createStudioOAuthHarness({
        ...configuration,
        redirectUri: "https://application.example.test/studio/auth/callback",
      }),
    ).toThrowError(expect.objectContaining({ code: "configuration_invalid" }));
    expect(() =>
      createStudioOAuthHarness({ ...configuration, clientId: "arbitrary-client" }),
    ).toThrowError(expect.objectContaining({ code: "configuration_invalid" }));
  });
});
