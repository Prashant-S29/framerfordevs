import { describe, expect, it } from "vitest";

import { editorBootstrapFailure, readEditorPreviewUrl, renderEditorBootstrap } from "./index";

const projectId = "019fae8b-1234-7000-8000-000000000001";
const environmentId = "019fae8b-1234-7000-8000-000000000002";
const expected = { projectId, environmentId, previewUrl: null };
const data = {
  formatVersion: 1,
  host: { kind: "local_editor", previewUrl: null },
  project: { id: projectId, name: "Website", workspaceId: "019fae8b-1234-7000-8000-000000000003" },
  environment: { id: environmentId, key: "main", name: "main" },
  user: { id: "user", name: "User", email: "user@example.test" },
  role: "content_admin",
  effectiveActions: ["project.read"],
  session: { expiresAt: "2026-11-24T12:00:00.000Z" },
};

describe("local editor bootstrap mapping", () => {
  it("replaces the platform host with the browser local editor host", () => {
    const result = renderEditorBootstrap({ ok: true, data }, 200, expected);
    expect(result.status).toBe(200);
    expect(result.body).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({ host: { kind: "local_editor" }, role: "content_admin" }),
      }),
    );
  });

  it("rejects a mounted host, another project, and a changed Preview URL", () => {
    const mounted = {
      ...data,
      host: {
        kind: "mounted",
        registration: {
          id: "019fae8b-1234-7000-8000-000000000004",
          version: 1,
          applicationOrigin: "https://app.example.test",
          mountPath: "/studio",
        },
      },
    };
    expect(renderEditorBootstrap({ ok: true, data: mounted }, 200, expected).status).toBe(503);
    expect(
      renderEditorBootstrap(
        { ok: true, data: { ...data, project: { ...data.project, id: environmentId } } },
        200,
        expected,
      ).status,
    ).toBe(503);
    const changed = renderEditorBootstrap({ ok: true, data }, 200, {
      ...expected,
      previewUrl: "https://www.example.test/preview",
    });
    expect(changed.body).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ code: "STUDIO_CONFIGURATION_INVALID" }),
      }),
    );
  });

  it.each([
    [401, "UNAUTHORIZED", 401, "STUDIO_AUTH_REQUIRED"],
    [409, "CMS_CAPABILITY_REQUIRED", 409, "STUDIO_CMS_DISABLED"],
    [403, "FORBIDDEN", 403, "STUDIO_FORBIDDEN"],
    [404, "NOT_FOUND", 404, "STUDIO_PROJECT_UNAVAILABLE"],
    [429, "RATE_LIMITED", 429, "STUDIO_RATE_LIMITED"],
    [500, "INTERNAL_ERROR", 503, "STUDIO_UPSTREAM_UNAVAILABLE"],
  ])("maps upstream %s %s to a browser failure", (status, code, browserStatus, browserCode) => {
    const result = editorBootstrapFailure({ ok: false, error: { code } }, status);
    expect(result.status).toBe(browserStatus);
    expect(result.body).toEqual(
      expect.objectContaining({ error: expect.objectContaining({ code: browserCode }) }),
    );
  });

  it("reads the Preview URL only from an exact local editor host", () => {
    expect(readEditorPreviewUrl({ ok: true, data })).toBeNull();
    expect(
      readEditorPreviewUrl({
        ok: true,
        data: { host: { kind: "local_editor", previewUrl: null, token: "secret" } },
      }),
    ).toBeUndefined();
  });
});
