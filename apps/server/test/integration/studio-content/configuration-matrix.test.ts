import { request as requestHttp, type OutgoingHttpHeaders } from "node:http";

import type { ApplicationEffectTransform } from "@framerfordevs/api/context";
import { StudioBootstrap } from "@framerfordevs/api/contracts/studio/index";
import { StudioCollectionConfigurationInvalidFailure } from "@framerfordevs/api/contracts/studio-content/index";
import {
  RateLimitDecision,
  rateLimitPolicies,
} from "@framerfordevs/api/contracts/rate-limit/index";
import { disposeApplicationRuntime } from "@framerfordevs/api/runtime/index";
import {
  RateLimitManager,
  type RateLimitManagerService,
} from "@framerfordevs/api/services/rate-limit/manager/index";
import {
  makeStudioOAuthTokenVerifier,
  StudioOAuthTokenVerifier,
} from "@framerfordevs/api/services/studio/principal-authenticator";
import {
  makeStudioRepository,
  StudioRepository,
} from "@framerfordevs/api/services/studio/repository";
import {
  makeStudioContentRepository,
  StudioContentRepository,
} from "@framerfordevs/api/services/studio-content/repository/index";
import type { StudioOAuthPrincipal } from "@framerfordevs/auth";
import { Effect, Schema } from "effect";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp, encodeStudioContentResponse } from "../../../src/app";

const projectId = "019fae8b-1234-7000-8000-000000000002";
const environmentId = "019fae8b-1234-7000-8000-000000000003";
const collectionId = "019fae8b-1234-7000-8000-000000000004";
const entryId = "019fae8b-1234-7000-8000-000000000005";
const registrationId = "019fae8b-1234-7000-8000-000000000009";
const token = "studio-content-http-token";
const base = `/api/studio-content/v1/projects/${projectId}/environments/${environmentId}/collections/${collectionId}/locales/en/entries`;
const principal: StudioOAuthPrincipal = {
  kind: "studio_oauth_user",
  userId: "studio-content-http-user",
  clientId: `ffd-studio-v1-${registrationId}`,
  registrationId,
  registrationVersion: 3,
  projectId,
  environmentId,
  grantId: "019fae8b-1234-7000-8000-000000000010",
  auditMarkerId: "019fae8b-1234-7000-8000-000000000011",
  grantExpiresAtEpochSeconds: 1_800_000_000,
  scopes: ["studio:session", "offline_access"],
  expiresAtEpochSeconds: 1_800_000_000,
};
const bootstrap = Schema.decodeUnknownSync(StudioBootstrap)({
  formatVersion: 1,
  registration: {
    id: registrationId,
    version: 3,
    applicationOrigin: "https://application.example.test",
    mountPath: "/studio",
  },
  project: {
    id: projectId,
    name: "Studio Content Project",
    workspaceId: "019fae8b-1234-7000-8000-000000000001",
  },
  environment: { id: environmentId, key: "main", name: "main" },
  user: { id: principal.userId, name: "Studio User", email: "studio@example.test" },
  role: "developer",
  effectiveActions: ["project.read", "project.update"],
  session: { expiresAt: "2027-01-15T08:00:00.000Z" },
});
const verifier = makeStudioOAuthTokenVerifier((value) =>
  Promise.resolve(value === token ? principal : null),
);
const studioRepository: ReturnType<typeof makeStudioRepository> = {
  authorizeOAuth: () => Effect.succeed({ allowed: true as const }),
  getBootstrap: () => Effect.succeed(bootstrap),
};
let authorizationCount = 0;
let rateLimitAllowed = true;
let configurationReason: "empty_schema" | "projection_invalid" = "projection_invalid";
const contentRepository: ReturnType<typeof makeStudioContentRepository> = {
  authorizeCollection: () => {
    authorizationCount += 1;
    return Effect.fail(
      StudioCollectionConfigurationInvalidFailure.make({ reason: configurationReason }),
    );
  },
  getContext: () => Effect.die("Unexpected context call."),
  listEntries: () => Effect.die("Nested work must not run after the projection gate."),
};
const rateLimitManager: RateLimitManagerService = {
  evaluate: (input) =>
    Effect.succeed(
      Schema.decodeUnknownSync(RateLimitDecision)({
        allowed: rateLimitAllowed,
        policy: input.policy,
        cost: input.cost,
        limit: rateLimitPolicies[input.policy].limitPerInterval,
        remaining: rateLimitAllowed ? rateLimitPolicies[input.policy].capacity : 0,
        resetAtEpochMs: Date.now() + rateLimitPolicies[input.policy].intervalMs,
        retryAfterSeconds: rateLimitAllowed ? null : 7,
        enforcementMode: "memory",
      }),
    ),
  reset: () => Effect.void,
  retainedFallbackEntryCount: Effect.succeed(0),
};
const studioEffectTransform: ApplicationEffectTransform = (effect) =>
  Effect.provideService(effect, StudioOAuthTokenVerifier, verifier).pipe(
    Effect.provideService(StudioRepository, studioRepository),
    Effect.provideService(StudioContentRepository, contentRepository),
    Effect.provideService(RateLimitManager, rateLimitManager),
  );
const app = createApp({ hostRoutingEnabled: false, studioEffectTransform });
const api = request(app);
const headers = { Authorization: `Bearer ${token}` };

function rawRequest(
  path: string,
  requestHeaders: OutgoingHttpHeaders,
  options: Readonly<{ method?: string; body?: string | Buffer }> = {},
): Promise<{
  readonly status: number;
  readonly body: string;
}> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("Studio Content test server did not bind."));
        return;
      }
      const outbound = requestHttp(
        {
          hostname: "127.0.0.1",
          port: address.port,
          path,
          method: options.method ?? "GET",
          headers: requestHeaders,
        },
        (incoming) => {
          const chunks: Array<Buffer> = [];
          incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
          incoming.on("end", () => {
            server.close((error) => {
              if (error) reject(error);
              else
                resolve({
                  status: incoming.statusCode ?? 0,
                  body: Buffer.concat(chunks).toString("utf8"),
                });
            });
          });
        },
      );
      outbound.on("error", (error) => server.close(() => reject(error)));
      outbound.end(options.body);
    });
  });
}

function duplicateAuthorizationRequest(): Promise<{
  readonly status: number;
  readonly body: string;
}> {
  return rawRequest(
    `/api/studio-content/v1/projects/${projectId}/environments/${environmentId}/context`,
    { Authorization: [`Bearer ${token}`, `Bearer ${token}`] },
  );
}
const hash = "a".repeat(64);

const operations = [
  () => api.get(base).set(headers),
  () => api.post(`${base}/search`).set(headers).send({ query: "ar", cursor: null, limit: 25 }),
  () => api.get(`${base}/new`).set(headers),
  () => api.get(`${base}/${entryId}`).set(headers),
  () =>
    api.post(base).set(headers).send({
      displayName: "Article",
      schemaRevisionId: entryId,
      contractHash: hash,
      commandId: collectionId,
      sharedMutations: [],
      localizedMutations: [],
    }),
  () =>
    api.patch(`${base}/${entryId}/name`).set(headers).send({
      displayName: "Renamed",
      expectedNameVersion: 1,
    }),
  () =>
    api.patch(`${base}/${entryId}/draft`).set(headers).send({
      schemaRevisionId: entryId,
      contractHash: hash,
      commandId: collectionId,
      expectedSharedVersion: 0,
      expectedLocalizedVersion: 0,
      sharedMutations: [],
      localizedMutations: [],
    }),
] as const;

afterAll(async () => {
  await disposeApplicationRuntime();
});

describe("Studio Content projection-invalid HTTP matrix", () => {
  it("publishes the deterministic companion specification and docs without bearer authority", async () => {
    const response = await api.get("/api/studio-content/v1/openapi.json");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("public, max-age=300");
    expect(response.body.info.title).toBe("Framer for Devs Studio Content API");
    expect(response.body.servers).toEqual([{ url: "/api/studio-content/v1" }]);

    const docs = await api.get("/api/studio-content/v1/docs");
    expect(docs.status).toBe(200);
    expect(docs.headers["content-type"]).toContain("text/html");
    expect(docs.headers["cache-control"]).toBe("public, max-age=300");
    expect(docs.text).toContain("Framer for Devs Studio Content API");
    expect(docs.text).not.toContain("access_token");
  });

  it("enforces bearer-only transport and finite route grammar", async () => {
    const context = `/api/studio-content/v1/projects/${projectId}/environments/${environmentId}/context`;
    const responses = [
      await api.get(context),
      await api.get(context).set("Authorization", "Basic forbidden"),
      await api.get(context).set("Authorization", `Bearer ${token}, Bearer ${token}`),
      await api.get(context).set(headers).set("Cookie", "session=forbidden"),
      await api.get(context).set(headers).set("Origin", "https://evil.example"),
      await api.options(context).set(headers),
      await api.delete(base).set(headers),
      await api.get(`${context}?expand=all`).set(headers),
      await api.get(`${base}?unknown=value`).set(headers),
      await api.get(`${base}?limit=25&limit=25`).set(headers),
      await api.get(base).set(headers).set("Content-Length", "1"),
    ];
    expect(responses.map(({ status }) => status)).toEqual([
      401, 401, 401, 401, 403, 403, 404, 400, 400, 400, 400,
    ]);
    for (const response of responses) {
      expect(response.headers["cache-control"]).toContain("no-store");
      expect(Object.keys(response.body).sort()).toEqual(["data", "error", "message", "ok"]);
      expect(response.body.ok).toBe(false);
      expect(response.body.data).toBeNull();
      expect(response.body.error.requestId).toMatch(/^[A-Za-z0-9_-]{1,128}$/u);
    }
    const invalidRoutes = [
      [`${base}/`, 404],
      [base.replace("/collections/", "/COLLECTIONS/"), 404],
      [base.replace(`/collections/${collectionId}/`, `/collections/${collectionId}//`), 404],
      [base.replace(collectionId, `${collectionId}%2Fforged`), 400],
    ] as const;
    for (const [route, status] of invalidRoutes) {
      const response = await api.get(route).set(headers);
      expect(response.status, route).toBe(status);
      expect(response.headers["cache-control"]).toContain("no-store");
    }
    for (const route of [`${base}/../entries`, `${base}/%2e%2e/entries`]) {
      const response = await rawRequest(route, headers);
      expect(response.status, route).toBe(404);
      expect(response.body).not.toContain("projection_invalid");
    }

    const invalidInputResponses = [
      await api.get(`${base}?limit=9`).set(headers),
      await api.get(`${base}?limit=51`).set(headers),
      await api.get(`${base}?cursor=not.valid`).set(headers),
      await api.get(base.replace(collectionId, "not-a-uuid")).set(headers),
      await api.post(`${base}/search`).set(headers).send({ query: "a", cursor: null, limit: 25 }),
      await api
        .post(`${base}/search`)
        .set(headers)
        .send({ query: "x".repeat(101), cursor: null, limit: 25 }),
      await api
        .post(`${base}/search`)
        .set(headers)
        .send({ query: "a\nb", cursor: null, limit: 25 }),
      await api
        .post(`${base}/search`)
        .set(headers)
        .send({ query: "article", cursor: null, limit: 9 }),
    ];
    for (const response of invalidInputResponses) {
      expect([400, 404]).toContain(response.status);
      expect(response.body.ok).toBe(false);
      expect(response.headers["cache-control"]).toContain("no-store");
    }

    const duplicate = await duplicateAuthorizationRequest();
    expect(duplicate.status).toBe(401);
    const duplicateBody = JSON.parse(duplicate.body);
    expect(duplicateBody.error.code).toBe("UNAUTHORIZED");
    expect(Object.keys(duplicateBody).sort()).toEqual(["data", "error", "message", "ok"]);
  });

  it("enforces exact request and response byte boundaries", async () => {
    const mutation = {
      displayName: "Article",
      schemaRevisionId: entryId,
      contractHash: hash,
      commandId: collectionId,
      sharedMutations: [{ operation: "set", path: [entryId], value: "" }],
      localizedMutations: [],
    };
    const baseline = JSON.stringify(mutation);
    mutation.sharedMutations[0]!.value = "x".repeat(
      1_048_576 - Buffer.byteLength(baseline, "utf8"),
    );
    const exactMutation = JSON.stringify(mutation);
    expect(Buffer.byteLength(exactMutation, "utf8")).toBe(1_048_576);
    expect(
      (
        await api
          .post(base)
          .set(headers)
          .set("Content-Type", "application/json")
          .send(exactMutation)
      ).status,
    ).toBe(409);
    mutation.sharedMutations[0]!.value += "x";
    const excessMutation = JSON.stringify(mutation);
    expect(Buffer.byteLength(excessMutation, "utf8")).toBe(1_048_577);
    expect(
      (
        await api
          .post(base)
          .set(headers)
          .set("Content-Type", "application/json")
          .send(excessMutation)
      ).status,
    ).toBe(413);

    const exactSearch = `"${"x".repeat(2_046)}"`;
    const excessSearch = `"${"x".repeat(2_047)}"`;
    expect(Buffer.byteLength(exactSearch, "utf8")).toBe(2_048);
    expect(Buffer.byteLength(excessSearch, "utf8")).toBe(2_049);
    expect(
      (
        await api
          .post(`${base}/search`)
          .set(headers)
          .set("Content-Type", "application/json")
          .send(exactSearch)
      ).status,
    ).toBe(400);
    expect(
      (
        await api
          .post(`${base}/search`)
          .set(headers)
          .set("Content-Type", "application/json")
          .send(excessSearch)
      ).status,
    ).toBe(413);

    const response = { ok: true, data: { padding: "" }, error: null, message: "Bounded." };
    const encoded = encodeStudioContentResponse(response);
    if (encoded === null) throw new Error("Baseline response unexpectedly exceeded the bound.");
    response.data.padding = "x".repeat(4_194_304 - encoded.byteLength);
    expect(encodeStudioContentResponse(response)?.byteLength).toBe(4_194_304);
    response.data.padding += "x";
    expect(encodeStudioContentResponse(response)).toBeNull();
  });

  it("rejects query expansion and malformed JSON at the isolated boundary", async () => {
    const query = await api
      .get(
        `/api/studio-content/v1/projects/${projectId}/environments/${environmentId}/context?access_token=forbidden`,
      )
      .set(headers);
    expect(query.status).toBe(400);
    expect(query.body.error.code).toBe("VALIDATION_ERROR");

    const invalidBodies = [
      await api
        .post(`${base}/search`)
        .set(headers)
        .set("Content-Type", "application/json")
        .send('{"query":'),
      await api
        .post(`${base}/search`)
        .set(headers)
        .set("Content-Type", "application/json")
        .send("null"),
      await api
        .post(`${base}/search`)
        .set(headers)
        .set("Content-Type", "application/json")
        .send("[]"),
      await api
        .post(`${base}/search`)
        .set(headers)
        .set("Content-Type", "application/json; charset=utf-8")
        .send({ query: "ar", cursor: null, limit: 25 }),
      await api
        .post(`${base}/search`)
        .set(headers)
        .send({ query: "ar", cursor: null, limit: 25, unexpected: true }),
    ];
    for (const response of invalidBodies) {
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(response.headers["cache-control"]).toContain("no-store");
    }
    const invalidUtf8 = await rawRequest(
      `${base}/search`,
      {
        ...headers,
        "Content-Type": "application/json",
        "Content-Length": 2,
      },
      { method: "POST", body: Buffer.from([0xc3, 0x28]) },
    );
    expect(invalidUtf8.status).toBe(400);
    expect(invalidUtf8.body).not.toContain("projection_invalid");
    const control = await api
      .post(`${base}/search`)
      .set(headers)
      .send({ query: "a\u0000", cursor: null, limit: 25 });
    expect(control.status).toBe(400);
    expect(control.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns bounded retry metadata when platform quota denies the request", async () => {
    rateLimitAllowed = false;
    try {
      const response = await api
        .get(`/api/studio-content/v1/projects/${projectId}/environments/${environmentId}/context`)
        .set(headers);
      expect(response.status).toBe(429);
      expect(response.body.error.code).toBe("RATE_LIMITED");
      expect(response.headers["retry-after"]).toBe("7");
      expect(response.headers["cache-control"]).toContain("no-store");
    } finally {
      rateLimitAllowed = true;
    }
  });

  it("returns both closed anomaly reasons before downstream work for all seven nested families", async () => {
    authorizationCount = 0;
    for (const reason of ["empty_schema", "projection_invalid"] as const) {
      configurationReason = reason;
      for (const operation of operations) {
        const response = await operation();
        expect(response.status, JSON.stringify(response.body)).toBe(409);
        expect(response.body.error.code).toBe("STUDIO_COLLECTION_CONFIGURATION_INVALID");
        expect(response.body.error.configurationReason).toBe(reason);
        expect(Object.keys(response.body).sort()).toEqual(["data", "error", "message", "ok"]);
        expect(response.body.error.requestId).toMatch(/^[A-Za-z0-9_-]{1,128}$/u);
        expect(response.headers["cache-control"]).toContain("no-store");
        expect(response.body.error.details).toEqual([
          {
            code: reason,
            message: "Repair this collection schema in the dashboard before continuing.",
          },
        ]);
      }
    }
    expect(authorizationCount).toBe(14);
    configurationReason = "projection_invalid";
  });
});
