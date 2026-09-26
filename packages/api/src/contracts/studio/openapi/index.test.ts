import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { studioOpenApiDocument, studioOpenApiJson } from "./index";

const bootstrapPath = "/projects/{projectId}/environments/{environmentId}/bootstrap";

describe("Studio OpenAPI", () => {
  it("publishes only the bounded server-to-server bootstrap route", () => {
    expect(studioOpenApiDocument.openapi).toBe("3.1.0");
    expect(studioOpenApiDocument.info.title).toBe("Framer for Devs Studio API");
    expect(Object.keys(studioOpenApiDocument.paths)).toEqual([bootstrapPath]);
    expect(Object.keys(studioOpenApiDocument.paths[bootstrapPath])).toEqual(["get"]);
    expect(studioOpenApiDocument.paths[bootstrapPath].get.security).toEqual([{ studioBearer: [] }]);

    const serialized = JSON.stringify(studioOpenApiDocument);
    expect(serialized).not.toContain("control-plane");
    expect(serialized).not.toContain("draft");
    expect(serialized).not.toContain("publication");
    expect(serialized).not.toContain("access_token");
    expect(serialized).not.toContain("refresh_token");
    expect(serialized).not.toContain("client_secret");
  });

  it("documents no-store bearer isolation and exact limits", () => {
    expect(studioOpenApiDocument.components.securitySchemes.studioBearer).toEqual(
      expect.objectContaining({ type: "http", scheme: "bearer", bearerFormat: "JWT" }),
    );
    expect(studioOpenApiDocument.components.headers.CacheControl.schema.const).toBe(
      "private, no-store, max-age=0",
    );
    expect(studioOpenApiDocument.components.headers.ReferrerPolicy.schema.const).toBe(
      "no-referrer",
    );
    expect(studioOpenApiDocument.components.headers.WwwAuthenticate.schema.const).toBe(
      'Bearer realm="studio", error="invalid_token"',
    );
    expect(studioOpenApiDocument["x-studio-limits"]).toEqual({
      requestBytes: 16_384,
      responseBytes: 65_536,
      authorizationBytes: 16_384,
      accessTokenLifetimeSeconds: 300,
      refreshTokenLifetimeSeconds: 28_800,
    });
  });

  it("keeps every schema reference resolvable", () => {
    const schemas = studioOpenApiDocument.components.schemas;
    const references = [
      ...JSON.stringify(studioOpenApiDocument).matchAll(/#\/components\/schemas\/([^"}]+)/gu),
    ].map((match) => match[1]);

    for (const reference of references) {
      expect(Object.hasOwn(schemas, reference ?? "")).toBe(true);
    }
    expect(Object.keys(schemas)).toEqual(
      expect.arrayContaining(["StudioBootstrapResponse", "StudioApiFailure"]),
    );
  });

  it("generates deterministic exact bytes", () => {
    expect(studioOpenApiJson).toBe(`${JSON.stringify(studioOpenApiDocument, null, 2)}\n`);
    expect(createHash("sha256").update(studioOpenApiJson).digest("hex")).toBe(
      "e8daa1e9e8b2d16b966cb5f30a019eda73ead1846f8ab151265123a5ee540745",
    );
  });
});
