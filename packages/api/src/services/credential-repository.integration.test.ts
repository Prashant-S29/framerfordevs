import { randomUUID } from "node:crypto";

import { afterAll, assert, beforeAll, describe, layer } from "@effect/vitest";
import { db } from "@framerfordevs/db";
import { and, eq, or, sql } from "@framerfordevs/db/query";
import {
  apiCredential,
  apiCredentialScope,
  projectMembership,
} from "@framerfordevs/db/schema/access";
import { user } from "@framerfordevs/db/schema/auth";
import { projectLocale } from "@framerfordevs/db/schema/locale";
import {
  auditEvent,
  environment,
  project,
  workspace,
  workspaceMembership,
} from "@framerfordevs/db/schema/platform";
import { Cause, Effect, Exit, Layer, Option, Schema } from "effect";

import {
  type IssuedApiCredential,
  IssueApiCredentialInput,
  ListApiCredentialsInput,
  RevokeApiCredentialInput,
  RotateApiCredentialInput,
} from "../contracts/access";
import { TelemetryLive } from "../observability/telemetry";
import {
  issueApiCredential,
  listApiCredentials,
  revokeApiCredential,
  rotateApiCredential,
} from "../operations/credentials";
import { CredentialAttemptLimiterLive } from "./credential-attempt-limiter";
import {
  type AuthenticateCredentialInput,
  CredentialAuthenticator,
  CredentialAuthenticatorLive,
} from "./credential-authenticator";
import { CredentialRepositoryLive } from "./credential-repository";
import { makePlatformRepository } from "./platform-repository";
import { PolicyServiceLive } from "./policy";
import { SecretGeneratorLive } from "./secret-generator";
import {
  AuthUserId,
  CreateProjectInput,
  CreateWorkspaceInput,
  type Project as ProjectModel,
  type Workspace as WorkspaceModel,
} from "../contracts/platform";

const suffix = randomUUID();
const ownerId = `m3-credential-owner-${suffix}`;
const developerId = `m3-credential-developer-${suffix}`;
const editorId = `m3-credential-editor-${suffix}`;
const ownerActor = Schema.decodeUnknownSync(AuthUserId)(ownerId);
const platform = makePlatformRepository();
const SecurityLayer = Layer.mergeAll(
  CredentialRepositoryLive,
  SecretGeneratorLive,
  CredentialAttemptLimiterLive,
  PolicyServiceLive,
  CredentialAuthenticatorLive,
  TelemetryLive,
);

let workspaceModel: WorkspaceModel | undefined;
let projectModel: ProjectModel | undefined;
let managementCredential: IssuedApiCredential | undefined;
let deliveryCredential: IssuedApiCredential | undefined;
let previewCredential: IssuedApiCredential | undefined;

function required<A>(value: A | undefined, label: string): A {
  if (value === undefined) throw new Error(`${label} is not initialized.`);
  return value;
}

function failureTag(exit: Exit.Exit<unknown, unknown>): string | undefined {
  if (Exit.isSuccess(exit)) return undefined;
  const failure = Option.getOrUndefined(Cause.failureOption(exit.cause));
  if (typeof failure === "object" && failure !== null && "_tag" in failure) {
    return typeof failure._tag === "string" ? failure._tag : undefined;
  }
  return undefined;
}

beforeAll(async () => {
  await db.insert(user).values([
    {
      id: ownerId,
      name: "M3 Credential Owner",
      email: `m3-credential-owner-${suffix}@example.test`,
      emailVerified: true,
    },
    {
      id: developerId,
      name: "M3 Credential Developer",
      email: `m3-credential-developer-${suffix}@example.test`,
      emailVerified: true,
    },
    {
      id: editorId,
      name: "M3 Credential Editor",
      email: `m3-credential-editor-${suffix}@example.test`,
      emailVerified: true,
    },
  ]);
  workspaceModel = await Effect.runPromise(
    platform.createWorkspace(
      ownerActor,
      Schema.decodeUnknownSync(CreateWorkspaceInput)({ name: "M3 Credential Workspace" }),
      "request-m3-credential-workspace",
    ),
  );
  projectModel = await Effect.runPromise(
    platform.createProject(
      ownerActor,
      Schema.decodeUnknownSync(CreateProjectInput)({
        workspaceId: required(workspaceModel, "workspace").id,
        name: "M3 Credential Project",
        key: `credential-${suffix.slice(0, 8)}`,
        description: null,
      }),
      "request-m3-credential-project",
    ),
  );
  await db.insert(workspaceMembership).values([
    {
      workspaceId: required(workspaceModel, "workspace").id,
      userId: developerId,
      role: "collaborator",
    },
    {
      workspaceId: required(workspaceModel, "workspace").id,
      userId: editorId,
      role: "collaborator",
    },
  ]);
  await db.insert(projectMembership).values([
    {
      workspaceId: required(workspaceModel, "workspace").id,
      projectId: required(projectModel, "project").id,
      userId: developerId,
      role: "developer",
      createdByUserId: ownerId,
    },
    {
      workspaceId: required(workspaceModel, "workspace").id,
      projectId: required(projectModel, "project").id,
      userId: editorId,
      role: "editor",
      createdByUserId: ownerId,
    },
  ]);
});

afterAll(async () => {
  const actorIds = [ownerId, developerId, editorId];
  await db.delete(auditEvent).where(or(...actorIds.map((id) => eq(auditEvent.actorId, id))));
  const credentials = await db
    .select({ id: apiCredential.id })
    .from(apiCredential)
    .where(eq(apiCredential.projectId, required(projectModel, "project").id));
  if (credentials.length > 0) {
    await db
      .delete(apiCredentialScope)
      .where(or(...credentials.map(({ id }) => eq(apiCredentialScope.credentialId, id))));
    await db
      .delete(apiCredential)
      .where(or(...credentials.map(({ id }) => eq(apiCredential.id, id))));
  }
  await db
    .delete(environment)
    .where(eq(environment.projectId, required(projectModel, "project").id));
  await db
    .delete(projectLocale)
    .where(eq(projectLocale.projectId, required(projectModel, "project").id));
  await db
    .delete(projectMembership)
    .where(or(...actorIds.map((id) => eq(projectMembership.userId, id))));
  await db.delete(project).where(eq(project.id, required(projectModel, "project").id));
  await db
    .delete(workspaceMembership)
    .where(or(...actorIds.map((id) => eq(workspaceMembership.userId, id))));
  await db.delete(workspace).where(eq(workspace.id, required(workspaceModel, "workspace").id));
  await db.delete(user).where(or(...actorIds.map((id) => eq(user.id, id))));
  await db.$client.end();
});

describe.sequential("credential repository PostgreSQL integration", () => {
  layer(SecurityLayer, { excludeTestServices: true })((it) => {
    it.effect("issues management, delivery, and preview credentials with one-time secrets", () =>
      Effect.gen(function* () {
        const currentProject = required(projectModel, "project");
        const common = {
          projectId: currentProject.id,
          environmentId: currentProject.environment.id,
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        };
        managementCredential = yield* issueApiCredential(
          ownerId,
          yield* Schema.decodeUnknown(IssueApiCredentialInput)({
            ...common,
            family: "management",
            name: "Management integration",
            scopes: ["project.read", "content.read", "content.write"],
          }),
          "request-m3-credential-management",
        );
        deliveryCredential = yield* issueApiCredential(
          developerId,
          yield* Schema.decodeUnknown(IssueApiCredentialInput)({
            ...common,
            family: "delivery",
            name: "Delivery integration",
            scopes: ["delivery.read"],
          }),
          "request-m3-credential-delivery",
        );
        previewCredential = yield* issueApiCredential(
          ownerId,
          yield* Schema.decodeUnknown(IssueApiCredentialInput)({
            ...common,
            family: "preview",
            name: "Preview integration",
            scopes: ["preview.read"],
          }),
          "request-m3-credential-preview",
        );

        for (const issued of [managementCredential, deliveryCredential, previewCredential]) {
          assert.isDefined(issued);
          assert.isTrue(issued?.key.startsWith(`${issued.credential.keyPrefix}_`) ?? false);
        }
        const rows = yield* Effect.promise(() =>
          db.select().from(apiCredential).where(eq(apiCredential.projectId, currentProject.id)),
        );
        const serialized = JSON.stringify(rows);
        assert.strictEqual(rows.length, 3);
        assert.notInclude(serialized, required(managementCredential, "management").key);
        assert.notInclude(serialized, required(deliveryCredential, "delivery").key);
        assert.notInclude(serialized, required(previewCredential, "preview").key);
        assert.isTrue(rows.every((row) => /^[0-9a-f]{64}$/u.test(row.keyDigest)));
      }),
    );

    it.effect(
      "rejects incompatible scopes, expired issue requests, and unauthorized editor issuance",
      () =>
        Effect.gen(function* () {
          const currentProject = required(projectModel, "project");
          const base = {
            projectId: currentProject.id,
            environmentId: currentProject.environment.id,
            name: "Rejected credential",
          };
          const incompatible = yield* Effect.exit(
            issueApiCredential(
              ownerId,
              yield* Schema.decodeUnknown(IssueApiCredentialInput)({
                ...base,
                family: "delivery",
                scopes: ["content.read"],
                expiresAt: null,
              }),
              "request-m3-credential-incompatible",
            ),
          );
          const expired = yield* Effect.exit(
            issueApiCredential(
              ownerId,
              yield* Schema.decodeUnknown(IssueApiCredentialInput)({
                ...base,
                family: "preview",
                scopes: ["preview.read"],
                expiresAt: new Date(Date.now() - 60_000).toISOString(),
              }),
              "request-m3-credential-expired",
            ),
          );
          const editor = yield* Effect.exit(
            issueApiCredential(
              editorId,
              yield* Schema.decodeUnknown(IssueApiCredentialInput)({
                ...base,
                family: "preview",
                scopes: ["preview.read"],
                expiresAt: null,
              }),
              "request-m3-credential-editor",
            ),
          );

          assert.strictEqual(failureTag(incompatible), "ValidationFailure");
          assert.strictEqual(failureTag(expired), "ValidationFailure");
          assert.strictEqual(failureTag(editor), "ForbiddenFailure");
        }),
    );

    it.effect("prevents locale-restricted developers from issuing or rotating credentials", () =>
      Effect.gen(function* () {
        const currentProject = required(projectModel, "project");
        yield* Effect.promise(() =>
          db
            .update(projectMembership)
            .set({ localeAccessMode: "selected" })
            .where(
              and(
                eq(projectMembership.projectId, currentProject.id),
                eq(projectMembership.userId, developerId),
              ),
            ),
        );
        const issue = yield* Effect.exit(
          issueApiCredential(
            developerId,
            yield* Schema.decodeUnknown(IssueApiCredentialInput)({
              projectId: currentProject.id,
              environmentId: currentProject.environment.id,
              family: "management",
              name: "Restricted issue",
              scopes: ["project.read"],
              expiresAt: null,
            }),
            "request-m4-restricted-credential-issue",
          ),
        );
        const currentManagement = required(managementCredential, "management credential");
        const rotate = yield* Effect.exit(
          rotateApiCredential(
            developerId,
            yield* Schema.decodeUnknown(RotateApiCredentialInput)({
              credentialId: currentManagement.credential.id,
              version: currentManagement.credential.version,
            }),
            "request-m4-restricted-credential-rotate",
          ),
        );
        yield* Effect.promise(() =>
          db
            .update(projectMembership)
            .set({ localeAccessMode: "all" })
            .where(
              and(
                eq(projectMembership.projectId, currentProject.id),
                eq(projectMembership.userId, developerId),
              ),
            ),
        );

        assert.strictEqual(failureTag(issue), "ForbiddenFailure");
        assert.strictEqual(failureTag(rotate), "ForbiddenFailure");
      }),
    );

    it.effect("lists bounded credential metadata without exposing keys or digests", () =>
      Effect.gen(function* () {
        const currentProject = required(projectModel, "project");
        const first = yield* listApiCredentials(
          developerId,
          yield* Schema.decodeUnknown(ListApiCredentialsInput)({
            projectId: currentProject.id,
            environmentId: currentProject.environment.id,
            cursor: null,
            limit: 2,
          }),
        );
        assert.strictEqual(first.items.length, 2);
        assert.isNotNull(first.nextCursor);
        if (!first.nextCursor) return;
        const second = yield* listApiCredentials(
          developerId,
          yield* Schema.decodeUnknown(ListApiCredentialsInput)({
            projectId: currentProject.id,
            environmentId: currentProject.environment.id,
            cursor: first.nextCursor,
            limit: 2,
          }),
        );
        const ids = [...first.items, ...second.items].map((item) => item.id);
        const serialized = JSON.stringify([...first.items, ...second.items]);
        assert.strictEqual(new Set(ids).size, 3);
        assert.notInclude(serialized, "keyDigest");
        assert.notInclude(serialized, required(managementCredential, "management").key);
      }),
    );

    it.effect("authenticates only the stored family, scope, and environment", () =>
      Effect.gen(function* () {
        const authenticator = yield* CredentialAuthenticator;
        const currentProject = required(projectModel, "project");
        const management = required(managementCredential, "management");
        const principal = yield* authenticator.authenticate({
          key: management.key,
          expectedFamily: "management",
          requiredScope: "content.write",
          workspaceId: currentProject.workspaceId,
          projectId: currentProject.id,
          environmentId: currentProject.environment.id,
          source: "198.51.100.10",
        });
        const denied = yield* Effect.all([
          Effect.exit(
            authenticator.authenticate({
              key: management.key,
              expectedFamily: "delivery",
              requiredScope: "delivery.read",
              workspaceId: currentProject.workspaceId,
              projectId: currentProject.id,
              environmentId: currentProject.environment.id,
              source: "198.51.100.11",
            }),
          ),
          Effect.exit(
            authenticator.authenticate({
              key: management.key,
              expectedFamily: "management",
              requiredScope: "schema.publish",
              workspaceId: currentProject.workspaceId,
              projectId: currentProject.id,
              environmentId: currentProject.environment.id,
              source: "198.51.100.12",
            }),
          ),
          Effect.exit(
            authenticator.authenticate({
              key: management.key,
              expectedFamily: "management",
              requiredScope: "content.read",
              workspaceId: currentProject.workspaceId,
              projectId: currentProject.id,
              environmentId: "019fae8b-1234-7000-8000-000000000099",
              source: "198.51.100.13",
            }),
          ),
          Effect.exit(
            authenticator.authenticate({
              key: `${management.key.slice(0, -1)}${management.key.endsWith("A") ? "B" : "A"}`,
              expectedFamily: "management",
              requiredScope: "content.read",
              workspaceId: currentProject.workspaceId,
              projectId: currentProject.id,
              environmentId: currentProject.environment.id,
              source: "198.51.100.14",
            }),
          ),
        ]);

        assert.strictEqual(principal.credentialId, management.credential.id);
        assert.isTrue(denied.every((exit) => failureTag(exit) === "CredentialInvalidFailure"));
      }),
    );

    it.effect("revokes credentials immediately and never returns the digest", () =>
      Effect.gen(function* () {
        const authenticator = yield* CredentialAuthenticator;
        const currentProject = required(projectModel, "project");
        const preview = required(previewCredential, "preview");
        const revoked = yield* revokeApiCredential(
          ownerId,
          yield* Schema.decodeUnknown(RevokeApiCredentialInput)({
            credentialId: preview.credential.id,
            version: preview.credential.version,
          }),
          "request-m3-credential-revoke",
        );
        const verification = yield* Effect.exit(
          authenticator.authenticate({
            key: preview.key,
            expectedFamily: "preview",
            requiredScope: "preview.read",
            workspaceId: currentProject.workspaceId,
            projectId: currentProject.id,
            environmentId: currentProject.environment.id,
            source: "198.51.100.20",
          }),
        );
        assert.isNotNull(revoked.revokedAt);
        assert.strictEqual(failureTag(verification), "CredentialInvalidFailure");
        assert.notInclude(JSON.stringify(revoked), "keyDigest");
      }),
    );

    it.effect(
      "rotates atomically, invalidates the predecessor, and authenticates the successor",
      () =>
        Effect.gen(function* () {
          const authenticator = yield* CredentialAuthenticator;
          const currentProject = required(projectModel, "project");
          const management = required(managementCredential, "management");
          const rotated = yield* rotateApiCredential(
            ownerId,
            yield* Schema.decodeUnknown(RotateApiCredentialInput)({
              credentialId: management.credential.id,
              version: management.credential.version,
            }),
            "request-m3-credential-rotate",
          );
          const predecessor = yield* Effect.exit(
            authenticator.authenticate({
              key: management.key,
              expectedFamily: "management",
              requiredScope: "content.read",
              workspaceId: currentProject.workspaceId,
              projectId: currentProject.id,
              environmentId: currentProject.environment.id,
              source: "198.51.100.30",
            }),
          );
          const successor = yield* authenticator.authenticate({
            key: rotated.key,
            expectedFamily: "management",
            requiredScope: "content.read",
            workspaceId: currentProject.workspaceId,
            projectId: currentProject.id,
            environmentId: currentProject.environment.id,
            source: "198.51.100.31",
          });

          assert.strictEqual(failureTag(predecessor), "CredentialInvalidFailure");
          assert.strictEqual(successor.credentialId, rotated.credential.id);
          assert.notEqual(rotated.credential.id, management.credential.id);
          managementCredential = rotated;
        }),
    );

    it.effect("allows exactly one concurrent rotate or revoke mutation", () =>
      Effect.gen(function* () {
        const delivery = required(deliveryCredential, "delivery");
        const rotateInput = yield* Schema.decodeUnknown(RotateApiCredentialInput)({
          credentialId: delivery.credential.id,
          version: delivery.credential.version,
        });
        const revokeInput = yield* Schema.decodeUnknown(RevokeApiCredentialInput)({
          credentialId: delivery.credential.id,
          version: delivery.credential.version,
        });
        const exits = yield* Effect.all(
          [
            Effect.exit(rotateApiCredential(ownerId, rotateInput, "request-m3-concurrent-rotate")),
            Effect.exit(revokeApiCredential(ownerId, revokeInput, "request-m3-concurrent-revoke")),
          ],
          { concurrency: 2 },
        );
        assert.strictEqual(exits.filter((exit) => exit._tag === "Success").length, 1);
        assert.strictEqual(
          exits.filter((exit) => failureTag(exit) === "VersionConflictFailure").length,
          1,
        );
      }),
    );

    it.effect("rate limits repeated malformed credential attempts before database lookup", () =>
      Effect.gen(function* () {
        const authenticator = yield* CredentialAuthenticator;
        const currentProject = required(projectModel, "project");
        const input: AuthenticateCredentialInput = {
          key: "malformed",
          expectedFamily: "delivery",
          requiredScope: "delivery.read",
          workspaceId: currentProject.workspaceId,
          projectId: currentProject.id,
          environmentId: currentProject.environment.id,
          source: "203.0.113.99",
        };
        for (let attempt = 0; attempt < 10; attempt += 1) {
          const exit = yield* Effect.exit(authenticator.authenticate(input));
          assert.strictEqual(failureTag(exit), "CredentialInvalidFailure");
        }
        const limited = yield* Effect.exit(authenticator.authenticate(input));
        assert.strictEqual(failureTag(limited), "RateLimitedFailure");
      }),
    );

    it.effect("uses primary-key verification and active family list indexes", () =>
      Effect.gen(function* () {
        const currentProject = required(projectModel, "project");
        const credential = required(managementCredential, "management").credential;
        const plans = yield* Effect.promise(() =>
          db.transaction(async (transaction) => {
            await transaction.execute(sql`set local enable_seqscan = off`);
            const verification = await transaction.execute(
              sql`explain (format json) select id from api_credential where id = ${credential.id} limit 1`,
            );
            const activeList = await transaction.execute(
              sql`explain (format json) select id from api_credential where project_id = ${currentProject.id} and environment_id = ${currentProject.environment.id} and family = 'management' and revoked_at is null order by created_at desc nulls last, id desc nulls last limit 20`,
            );
            return JSON.stringify([verification.rows, activeList.rows]);
          }),
        );

        assert.isTrue(
          plans.includes("api_credential_pkey") ||
            plans.includes("api_credential_id_tenant_unique"),
        );
        assert.include(plans, "api_credential_project_environment_active_family_created_id_idx");
      }),
    );

    it.effect("persists only safe credential audit metadata", () =>
      Effect.gen(function* () {
        const currentProject = required(projectModel, "project");
        const audits = yield* Effect.promise(() =>
          db
            .select()
            .from(auditEvent)
            .where(
              and(
                eq(auditEvent.projectId, currentProject.id),
                eq(auditEvent.resourceType, "api_credential"),
              ),
            ),
        );
        const serialized = JSON.stringify(audits);
        assert.isTrue(audits.length >= 5);
        assert.notInclude(serialized, required(managementCredential, "management").key);
        assert.notInclude(serialized, "keyDigest");
        assert.notInclude(serialized, "content.write");
      }),
    );
  });
});
