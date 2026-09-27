// Dependency-free browser BFF contract. It intentionally contains no OAuth token or control-plane authority.

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const isoDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const mountPath = /^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/u;
const roles = new Set([
  "owner",
  "developer",
  "content_admin",
  "editor",
  "reviewer",
  "client_editor",
  "read_only",
]);

export interface StudioBrowserBootstrap {
  readonly formatVersion: 1;
  readonly registration: Readonly<{
    readonly id: string;
    readonly version: number;
    readonly applicationOrigin: string;
    readonly mountPath: string;
  }>;
  readonly project: Readonly<{
    readonly id: string;
    readonly name: string;
    readonly workspaceId: string;
  }>;
  readonly environment: Readonly<{
    readonly id: string;
    readonly key: "main";
    readonly name: "main";
  }>;
  readonly user: Readonly<{
    readonly id: string;
    readonly name: string;
    readonly email: string;
  }>;
  readonly role: string;
  readonly effectiveActions: ReadonlyArray<"project.read" | "project.update">;
  readonly session: Readonly<{ readonly expiresAt: string }>;
}

export type StudioBrowserErrorCode =
  | "STUDIO_AUTH_REQUIRED"
  | "STUDIO_REQUEST_INVALID"
  | "STUDIO_ORIGIN_INVALID"
  | "STUDIO_SESSION_INVALID"
  | "STUDIO_UPSTREAM_UNAVAILABLE"
  | "STUDIO_CONFIGURATION_INVALID"
  | "STUDIO_ROUTE_NOT_FOUND"
  | "STUDIO_RATE_LIMITED"
  | "STUDIO_FORBIDDEN"
  | "STUDIO_PROJECT_UNAVAILABLE"
  | "STUDIO_CMS_DISABLED"
  | "STUDIO_REGISTRATION_INACTIVE";

export interface StudioBrowserError {
  readonly code: StudioBrowserErrorCode;
  readonly message: string;
  readonly requestId?: string;
}
export interface StudioBrowserSuccess {
  readonly ok: true;
  readonly data: StudioBrowserBootstrap;
  readonly error: null;
  readonly message: string;
}
export interface StudioBrowserFailure {
  readonly ok: false;
  readonly data: null;
  readonly error: StudioBrowserError;
  readonly message: string;
}
export type StudioBrowserResponse = StudioBrowserSuccess | StudioBrowserFailure;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys(value: Readonly<Record<string, unknown>>, keys: ReadonlyArray<string>): boolean {
  return Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}
function boundedString(value: unknown, minimum: number, maximum: number): value is string {
  return typeof value === "string" && value.length >= minimum && value.length <= maximum;
}
function canonicalOrigin(value: unknown): value is string {
  if (!boundedString(value, 1, 2_048)) return false;
  try {
    const url = new URL(value);
    const loopback =
      url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
    return (
      url.origin === value &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (url.protocol === "https:" || (url.protocol === "http:" && loopback))
    );
  } catch {
    return false;
  }
}

export function decodeStudioBrowserBootstrap(value: unknown): StudioBrowserBootstrap {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "formatVersion",
      "registration",
      "project",
      "environment",
      "user",
      "role",
      "effectiveActions",
      "session",
    ])
  )
    throw new Error("STUDIO_BROWSER_RESPONSE_INVALID");
  const registration = isRecord(value.registration) ? value.registration : {};
  const project = isRecord(value.project) ? value.project : {};
  const environment = isRecord(value.environment) ? value.environment : {};
  const user = isRecord(value.user) ? value.user : {};
  const session = isRecord(value.session) ? value.session : {};
  const actions = value.effectiveActions;
  if (
    value.formatVersion !== 1 ||
    !exactKeys(registration, ["id", "version", "applicationOrigin", "mountPath"]) ||
    typeof registration.id !== "string" ||
    !uuid.test(registration.id) ||
    typeof registration.version !== "number" ||
    !Number.isSafeInteger(registration.version) ||
    registration.version < 1 ||
    !canonicalOrigin(registration.applicationOrigin) ||
    typeof registration.mountPath !== "string" ||
    registration.mountPath.length > 240 ||
    !mountPath.test(registration.mountPath) ||
    !exactKeys(project, ["id", "name", "workspaceId"]) ||
    typeof project.id !== "string" ||
    !uuid.test(project.id) ||
    !boundedString(project.name, 1, 100) ||
    typeof project.workspaceId !== "string" ||
    !uuid.test(project.workspaceId) ||
    !exactKeys(environment, ["id", "key", "name"]) ||
    typeof environment.id !== "string" ||
    !uuid.test(environment.id) ||
    environment.key !== "main" ||
    environment.name !== "main" ||
    !exactKeys(user, ["id", "name", "email"]) ||
    !boundedString(user.id, 1, 255) ||
    !boundedString(user.name, 1, 100) ||
    !boundedString(user.email, 3, 320) ||
    typeof value.role !== "string" ||
    !roles.has(value.role) ||
    !Array.isArray(actions) ||
    actions.length > 2 ||
    actions.some((action) => action !== "project.read" && action !== "project.update") ||
    new Set(actions).size !== actions.length ||
    !exactKeys(session, ["expiresAt"]) ||
    typeof session.expiresAt !== "string" ||
    !isoDateTime.test(session.expiresAt)
  )
    throw new Error("STUDIO_BROWSER_RESPONSE_INVALID");
  return {
    formatVersion: 1,
    registration: {
      id: registration.id,
      version: registration.version,
      applicationOrigin: registration.applicationOrigin,
      mountPath: registration.mountPath,
    },
    project: { id: project.id, name: project.name, workspaceId: project.workspaceId },
    environment: { id: environment.id, key: "main", name: "main" },
    user: { id: user.id, name: user.name, email: user.email },
    role: value.role,
    effectiveActions: actions,
    session: { expiresAt: session.expiresAt },
  };
}

function isErrorCode(value: unknown): value is StudioBrowserErrorCode {
  return (
    value === "STUDIO_AUTH_REQUIRED" ||
    value === "STUDIO_REQUEST_INVALID" ||
    value === "STUDIO_ORIGIN_INVALID" ||
    value === "STUDIO_SESSION_INVALID" ||
    value === "STUDIO_UPSTREAM_UNAVAILABLE" ||
    value === "STUDIO_CONFIGURATION_INVALID" ||
    value === "STUDIO_ROUTE_NOT_FOUND" ||
    value === "STUDIO_RATE_LIMITED" ||
    value === "STUDIO_FORBIDDEN" ||
    value === "STUDIO_PROJECT_UNAVAILABLE" ||
    value === "STUDIO_CMS_DISABLED" ||
    value === "STUDIO_REGISTRATION_INACTIVE"
  );
}

export function decodeStudioBrowserResponse(value: unknown): StudioBrowserResponse {
  if (!isRecord(value) || !exactKeys(value, ["ok", "data", "error", "message"]))
    throw new Error("STUDIO_BROWSER_RESPONSE_INVALID");
  if (value.ok === true && value.error === null && boundedString(value.message, 1, 200)) {
    return {
      ok: true,
      data: decodeStudioBrowserBootstrap(value.data),
      error: null,
      message: value.message,
    };
  }
  if (
    value.ok !== false ||
    value.data !== null ||
    !isRecord(value.error) ||
    !boundedString(value.message, 1, 200)
  )
    throw new Error("STUDIO_BROWSER_RESPONSE_INVALID");
  const allowedErrorKeys =
    value.error.requestId === undefined ? ["code", "message"] : ["code", "message", "requestId"];
  if (
    !exactKeys(value.error, allowedErrorKeys) ||
    !isErrorCode(value.error.code) ||
    !boundedString(value.error.message, 1, 200) ||
    (value.error.requestId !== undefined && !boundedString(value.error.requestId, 1, 128))
  )
    throw new Error("STUDIO_BROWSER_RESPONSE_INVALID");
  return {
    ok: false,
    data: null,
    error: {
      code: value.error.code,
      message: value.error.message,
      ...(value.error.requestId === undefined ? {} : { requestId: value.error.requestId }),
    },
    message: value.message,
  };
}
