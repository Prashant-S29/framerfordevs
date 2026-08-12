// Issues compliant short-lived Preview load credentials through normal audited controls.

import { readFile, writeFile } from "node:fs/promises";

import { Effect, Schema } from "effect";

const help = process.argv.includes("--help") || process.argv.includes("-h");
if (help) {
  process.stdout.write(
    [
      "Usage: pnpm --filter @framerfordevs/api preview:load-prepare -- [options]",
      "",
      "Options:",
      "  --credentials=COUNT   Issue 1 through 40 load credentials (default: 20).",
      "  --days=DAYS           Expire credentials in 1 through 30 days (default: 1).",
      "  --replace-existing    Acknowledge active Preview credentials without mutating them.",
      "  --help, -h            Show this help without reading runtime configuration.",
      "",
    ].join("\n"),
  );
  process.exit(0);
}

const serverEnvironmentPath = "../../apps/server/.env";
const loadEnvironmentPath = "../../preview-load.env";
process.loadEnvFile(serverEnvironmentPath);
try {
  process.loadEnvFile(loadEnvironmentPath);
} catch (cause) {
  const code =
    typeof cause === "object" && cause !== null && "code" in cause ? String(cause.code) : undefined;
  if (code !== "ENOENT") throw cause;
}

const projectId = process.env.PREVIEW_PROJECT_ID ?? "";
const environmentKey = process.env.PREVIEW_ENVIRONMENT_KEY ?? "main";
const replaceExisting = process.argv.includes("--replace-existing");
const requestedCredentialCount = Number(
  process.argv
    .find((argument) => argument.startsWith("--credentials="))
    ?.slice("--credentials=".length) ?? "20",
);
const lifetimeDays = Number(
  process.argv.find((argument) => argument.startsWith("--days="))?.slice("--days=".length) ?? "1",
);
if (!Schema.is(Schema.UUID)(projectId)) throw new Error("PREVIEW_PROJECT_ID must be a UUID.");
if (!/^[a-z][a-z0-9_]{0,62}$/u.test(environmentKey)) {
  throw new Error("PREVIEW_ENVIRONMENT_KEY must be a canonical environment key.");
}
if (
  !Number.isInteger(requestedCredentialCount) ||
  requestedCredentialCount < 1 ||
  requestedCredentialCount > 40
) {
  throw new Error("--credentials must be from 1 through 40.");
}
if (!Number.isInteger(lifetimeDays) || lifetimeDays < 1 || lifetimeDays > 30) {
  throw new Error("--days must be from 1 through 30.");
}

function encodeEnvironmentValue(value: string): string {
  return JSON.stringify(value);
}

async function setEnvironmentValue(path: string, key: string, value: string): Promise<void> {
  const source = await readFile(path, "utf8").catch(() => "");
  const line = `${key}=${encodeEnvironmentValue(value)}`;
  const expression = new RegExp(`^${key}=.*$`, "mu");
  const next = expression.test(source)
    ? source.replace(expression, line)
    : `${source}${source.endsWith("\n") || source.length === 0 ? "" : "\n"}${line}\n`;
  await writeFile(path, next, { encoding: "utf8", mode: 0o600 });
}

async function ensureRuntimeEnvironment(): Promise<void> {
  const source = await readFile(serverEnvironmentPath, "utf8").catch(() => "");
  const hasValue = (key: string) => new RegExp(`^${key}=.+$`, "mu").test(source);
  await setEnvironmentValue(serverEnvironmentPath, "NODE_ENV", "production");
  await setEnvironmentValue(serverEnvironmentPath, "APPLICATION_LOG_LEVEL", "error");
  await setEnvironmentValue(serverEnvironmentPath, "DATABASE_POOL_MAX", "10");
  await setEnvironmentValue(serverEnvironmentPath, "PREVIEW_API_ENABLED", "true");
  await setEnvironmentValue(serverEnvironmentPath, "RATE_LIMIT_STORE", "redis");
  await setEnvironmentValue(serverEnvironmentPath, "RATE_LIMIT_REDIS_URL", "redis://redis:6379");
  await setEnvironmentValue(serverEnvironmentPath, "RATE_LIMIT_REDIS_TIMEOUT_MS", "100");
  if (!hasValue("RATE_LIMIT_FINGERPRINT_SECRET")) {
    throw new Error(
      "Configure RATE_LIMIT_FINGERPRINT_SECRET through the existing secure environment before preparing Preview load credentials.",
    );
  }
}

const [
  { db },
  query,
  accessSchema,
  platformSchema,
  accessContracts,
  { AuthUserId },
  { makeCredentialRepository },
  { makeSecretGenerator },
] = await Promise.all([
  import("@framerfordevs/db"),
  import("@framerfordevs/db/query"),
  import("@framerfordevs/db/schema/access"),
  import("@framerfordevs/db/schema/platform"),
  import("../contracts/access"),
  import("../contracts/platform"),
  import("../services/credential-repository"),
  import("../services/secret-generator"),
]);

const [authority] = await db
  .select({
    actorId: platformSchema.project.createdByUserId,
    environmentId: platformSchema.environment.id,
  })
  .from(platformSchema.project)
  .innerJoin(
    platformSchema.environment,
    query.and(
      query.eq(platformSchema.environment.projectId, platformSchema.project.id),
      query.eq(platformSchema.environment.key, environmentKey),
    ),
  )
  .where(query.eq(platformSchema.project.id, projectId))
  .limit(1);
if (authority === undefined) throw new Error("The configured project environment was not found.");

const activeExisting = await db
  .select({ id: accessSchema.apiCredential.id })
  .from(accessSchema.apiCredential)
  .where(
    query.and(
      query.eq(accessSchema.apiCredential.projectId, projectId),
      query.eq(accessSchema.apiCredential.environmentId, authority.environmentId),
      query.eq(accessSchema.apiCredential.family, "preview"),
      query.isNull(accessSchema.apiCredential.revokedAt),
      query.sql`not exists (
        select 1 from api_credential successor
        where successor.rotated_from_credential_id = ${accessSchema.apiCredential.id}
      )`,
    ),
  );
if (activeExisting.length > 0 && !replaceExisting) {
  throw new Error(
    "Active Preview credentials already exist. Re-run only after deciding whether to replace them, using --replace-existing to acknowledge that decision; revoke predecessors through normal audited controls after issuance.",
  );
}

await ensureRuntimeEnvironment();
const actorId = Schema.decodeUnknownSync(AuthUserId)(authority.actorId);
const credentials = makeCredentialRepository();
const secrets = makeSecretGenerator();
const issuedKeys: Array<string> = [];
const issuedIds: Array<string> = [];
const now = new Date();
const expiresAt = new Date(now.getTime() + lifetimeDays * 24 * 60 * 60 * 1_000);
const runId = now
  .toISOString()
  .replaceAll(/[-:.TZ]/gu, "")
  .slice(0, 14);

for (let index = 1; index <= requestedCredentialCount; index += 1) {
  const credentialId = await Effect.runPromise(credentials.allocateCredentialId());
  const material = await Effect.runPromise(
    secrets.generateCredentialMaterial("preview", credentialId),
  );
  await Effect.runPromise(
    credentials.issueCredential(
      actorId,
      Schema.decodeUnknownSync(accessContracts.IssueApiCredentialInput)({
        projectId,
        environmentId: authority.environmentId,
        family: "preview",
        name: `M10 load ${runId}-${String(index).padStart(2, "0")}`,
        scopes: ["preview.read"],
        expiresAt: expiresAt.toISOString(),
        previewAuthorityAcknowledged: true,
      }),
      credentialId,
      material,
      now,
      `m10-load-credential-${runId}-${index}`,
    ),
  );
  issuedIds.push(credentialId);
  issuedKeys.push(material.key);
  await setEnvironmentValue(loadEnvironmentPath, "PREVIEW_CREDENTIALS", issuedKeys.join(","));
  await setEnvironmentValue(loadEnvironmentPath, "PREVIEW_CREDENTIAL_IDS", issuedIds.join(","));
}

await setEnvironmentValue(loadEnvironmentPath, "PREVIEW_PROJECT_ID", projectId);
await setEnvironmentValue(
  loadEnvironmentPath,
  "PREVIEW_REPLACED_CREDENTIAL_IDS",
  activeExisting.map((row) => row.id).join(","),
);
await setEnvironmentValue(loadEnvironmentPath, "PREVIEW_ENVIRONMENT_KEY", environmentKey);
process.stdout.write(
  `Issued ${issuedKeys.length} compliant Preview load credentials expiring in ${lifetimeDays} day(s). Revoke them through normal audited controls after the load gate.\n`,
);
