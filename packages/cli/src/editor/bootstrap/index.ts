import { decodeStudioBrowserBootstrap } from "@framerfordevs/studio/contracts";

export interface EditorBootstrapExpectation {
  readonly projectId: string;
  readonly environmentId: string;
  readonly previewUrl: string | null;
}

export interface EditorBootstrapResult {
  readonly status: number;
  readonly body: unknown;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function failure(status: number, code: string, message: string): EditorBootstrapResult {
  return { status, body: { ok: false, data: null, error: { code, message }, message } };
}

export function editorBootstrapFailure(value: unknown, status: number): EditorBootstrapResult {
  const error = isRecord(value) && isRecord(value.error) ? value.error : null;
  const code = error?.code;
  if (status === 429 || code === "RATE_LIMITED") {
    return failure(429, "STUDIO_RATE_LIMITED", "Too many Studio requests.");
  }
  if (status === 401 || code === "UNAUTHORIZED") {
    return failure(401, "STUDIO_AUTH_REQUIRED", "Run ffd login, then start ffd editor again.");
  }
  if (code === "CMS_CAPABILITY_REQUIRED") {
    return failure(
      409,
      "STUDIO_CMS_DISABLED",
      "The CMS capability is not active for this project.",
    );
  }
  if (status === 403 || code === "FORBIDDEN") {
    return failure(
      403,
      "STUDIO_FORBIDDEN",
      "The current project role does not allow Studio access.",
    );
  }
  if (status === 404 || code === "NOT_FOUND") {
    return failure(404, "STUDIO_PROJECT_UNAVAILABLE", "The project is not available.");
  }
  return failure(503, "STUDIO_UPSTREAM_UNAVAILABLE", "The Studio service is unavailable.");
}

export function readEditorPreviewUrl(value: unknown): string | null | undefined {
  const data = isRecord(value) && value.ok === true && isRecord(value.data) ? value.data : null;
  const host = data !== null && isRecord(data.host) ? data.host : null;
  if (
    host === null ||
    host.kind !== "local_editor" ||
    Object.keys(host).sort().join(",") !== "kind,previewUrl" ||
    !(host.previewUrl === null || typeof host.previewUrl === "string")
  ) {
    return undefined;
  }
  return host.previewUrl;
}

export function renderEditorBootstrap(
  value: unknown,
  status: number,
  expected: EditorBootstrapExpectation,
): EditorBootstrapResult {
  if (status !== 200 || !isRecord(value) || value.ok !== true) {
    return editorBootstrapFailure(value, status);
  }
  const previewUrl = readEditorPreviewUrl(value);
  if (previewUrl === undefined || !isRecord(value.data)) {
    return failure(503, "STUDIO_UPSTREAM_UNAVAILABLE", "The Studio service is unavailable.");
  }
  if (previewUrl !== expected.previewUrl) {
    return failure(
      503,
      "STUDIO_CONFIGURATION_INVALID",
      "The Preview URL changed. Stop ffd editor and start it again.",
    );
  }
  try {
    const bootstrap = decodeStudioBrowserBootstrap({
      ...value.data,
      host: { kind: "local_editor" },
    });
    if (
      bootstrap.project.id !== expected.projectId ||
      bootstrap.environment.id !== expected.environmentId
    ) {
      return failure(503, "STUDIO_UPSTREAM_UNAVAILABLE", "The Studio service is unavailable.");
    }
    return {
      status: 200,
      body: { ok: true, data: bootstrap, error: null, message: "Studio bootstrap loaded." },
    };
  } catch {
    return failure(503, "STUDIO_UPSTREAM_UNAVAILABLE", "The Studio service is unavailable.");
  }
}
