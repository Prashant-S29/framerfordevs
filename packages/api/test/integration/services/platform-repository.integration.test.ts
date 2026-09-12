import { randomUUID } from "node:crypto";

import { afterAll, assert, beforeAll, describe, it } from "@effect/vitest";
import { db } from "@framerfordevs/db";
import { and, eq, or, sql } from "@framerfordevs/db/query";
import {
  apiCredential,
  apiCredentialScope,
  projectMembership,
} from "@framerfordevs/db/schema/access";
import {
  controlPlaneCommandReceipt,
  studioRegistration,
} from "@framerfordevs/db/schema/control-plane";
import { user } from "@framerfordevs/db/schema/auth";
import { projectLocale } from "@framerfordevs/db/schema/locale";
import {
  auditEvent,
  environment,
  project,
  projectCapability,
  workspace,
  workspaceMembership,
} from "@framerfordevs/db/schema/platform";
import { Cause, Effect, Exit, Option, Schema } from "effect";

import {
  ControlPlaneCommandId,
  ControlPlaneCreateProjectRequest,
  ControlPlaneCreateWorkspaceRequest,
  ControlPlanePutStudioRegistrationRequest,
  ControlPlaneUpdateProjectRequest,
} from "../../../src/contracts/control-plane";
import { ApiCredentialId } from "../../../src/contracts/access";
import {
  ArchiveProjectInput,
  AuthUserId,
  CreateProjectInput,
  CreateWorkspaceInput,
  EnableCapabilityInput,
  GetProjectInput,
  ListProjectsInput,
  ListWorkspacesInput,
  type Project as ProjectModel,
  RestoreProjectInput,
  UpdateProjectInput,
  type Workspace as WorkspaceModel,
} from "../../../src/contracts/platform";
import {
  inspectControlPlaneReceipt,
  persistControlPlaneReceipt,
  type ControlPlaneReceiptExpectation,
} from "../../../src/services/control-plane/command-receipt";
import { makePlatformRepository } from "../../../src/services/platform-repository";

const repository = makePlatformRepository();
const suffix = randomUUID();
const firstUserId = `m2-owner-a-${suffix}`;
const secondUserId = `m2-owner-b-${suffix}`;
const firstEmail = `m2-owner-a-${suffix}@example.test`;
const secondEmail = `m2-owner-b-${suffix}@example.test`;
const firstActor = Schema.decodeUnknownSync(AuthUserId)(firstUserId);
const secondActor = Schema.decodeUnknownSync(AuthUserId)(secondUserId);
const studioCredentialId = randomUUID();

let firstWorkspace: WorkspaceModel | undefined;
let secondWorkspace: WorkspaceModel | undefined;
let primaryProject: ProjectModel | undefined;

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
      id: firstUserId,
      name: "M2 Owner A",
      email: firstEmail,
      emailVerified: true,
    },
    {
      id: secondUserId,
      name: "M2 Owner B",
      email: secondEmail,
      emailVerified: true,
    },
  ]);
});

afterAll(async () => {
  const actorCondition = or(
    eq(auditEvent.actorId, firstUserId),
    eq(auditEvent.actorId, secondUserId),
    eq(auditEvent.actorId, studioCredentialId),
  );
  await db
    .delete(controlPlaneCommandReceipt)
    .where(
      or(
        eq(controlPlaneCommandReceipt.actorId, firstUserId),
        eq(controlPlaneCommandReceipt.actorId, secondUserId),
        eq(controlPlaneCommandReceipt.actorId, studioCredentialId),
      ),
    );
  await db
    .delete(studioRegistration)
    .where(
      or(
        eq(studioRegistration.createdByUserId, firstUserId),
        eq(studioRegistration.createdByUserId, secondUserId),
      ),
    );
  await db.delete(auditEvent).where(actorCondition);
  await db
    .delete(projectCapability)
    .where(
      or(
        eq(projectCapability.changedByUserId, firstUserId),
        eq(projectCapability.changedByUserId, secondUserId),
      ),
    );
  await db
    .delete(apiCredentialScope)
    .where(eq(apiCredentialScope.credentialId, studioCredentialId));
  await db.delete(apiCredential).where(eq(apiCredential.id, studioCredentialId));
  await db
    .delete(environment)
    .where(
      or(
        eq(environment.createdByUserId, firstUserId),
        eq(environment.createdByUserId, secondUserId),
      ),
    );
  await db
    .delete(projectLocale)
    .where(
      or(
        eq(projectLocale.createdByUserId, firstUserId),
        eq(projectLocale.createdByUserId, secondUserId),
      ),
    );
  await db
    .delete(projectMembership)
    .where(
      or(eq(projectMembership.userId, firstUserId), eq(projectMembership.userId, secondUserId)),
    );
  await db
    .delete(project)
    .where(or(eq(project.createdByUserId, firstUserId), eq(project.createdByUserId, secondUserId)));
  await db
    .delete(workspaceMembership)
    .where(
      or(eq(workspaceMembership.userId, firstUserId), eq(workspaceMembership.userId, secondUserId)),
    );
  await db
    .delete(workspace)
    .where(
      or(eq(workspace.createdByUserId, firstUserId), eq(workspace.createdByUserId, secondUserId)),
    );
  await db.delete(user).where(or(eq(user.id, firstUserId), eq(user.id, secondUserId)));
  await db.$client.end();
});

describe.sequential("platform repository PostgreSQL integration", () => {
  it.effect("atomically creates a workspace, owner membership, and safe audit events", () =>
    Effect.gen(function* () {
      firstWorkspace = yield* repository.createWorkspace(
        firstActor,
        yield* Schema.decodeUnknown(CreateWorkspaceInput)({ name: "Agency Workspace" }),
        "request-m2-workspace-a",
      );
      secondWorkspace = yield* repository.createWorkspace(
        secondActor,
        yield* Schema.decodeUnknown(CreateWorkspaceInput)({ name: "Client Workspace" }),
        "request-m2-workspace-b",
      );

      const created = required(firstWorkspace, "first workspace");
      const memberships = yield* Effect.promise(() =>
        db
          .select()
          .from(workspaceMembership)
          .where(eq(workspaceMembership.workspaceId, created.id)),
      );
      const audits = yield* Effect.promise(() =>
        db.select().from(auditEvent).where(eq(auditEvent.workspaceId, created.id)),
      );

      assert.strictEqual(created.role, "owner");
      assert.strictEqual(memberships.length, 1);
      assert.strictEqual(memberships[0]?.role, "owner");
      assert.deepEqual(audits.map((event) => event.action).sort(), [
        "workspace.created",
        "workspace.membership.created",
      ]);
      assert.isTrue(audits.every((event) => event.requestId === "request-m2-workspace-a"));
    }),
  );

  it.effect("rolls back workspace state when the final audit insert fails", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        repository.createWorkspace(
          firstActor,
          yield* Schema.decodeUnknown(CreateWorkspaceInput)({ name: "Rollback Workspace" }),
          "invalid request id",
        ),
      );
      const rows = yield* Effect.promise(() =>
        db.select().from(workspace).where(eq(workspace.name, "Rollback Workspace")),
      );

      assert.isTrue(Exit.isFailure(exit));
      assert.strictEqual(failureTag(exit), "DatabaseFailure");
      assert.strictEqual(rows.length, 0);
    }),
  );

  it.effect("lists only the actor's workspaces with bounded cursors", () =>
    Effect.gen(function* () {
      const additionalWorkspace = yield* repository.createWorkspace(
        firstActor,
        yield* Schema.decodeUnknown(CreateWorkspaceInput)({ name: "Second Agency Workspace" }),
        "request-m2-workspace-additional",
      );
      const firstPage = yield* repository.listWorkspaces(
        firstActor,
        yield* Schema.decodeUnknown(ListWorkspacesInput)({ cursor: null, limit: 1 }),
      );
      assert.isNotNull(firstPage.nextCursor);
      if (!firstPage.nextCursor) return;
      const secondPage = yield* repository.listWorkspaces(
        firstActor,
        yield* Schema.decodeUnknown(ListWorkspacesInput)({
          cursor: firstPage.nextCursor,
          limit: 1,
        }),
      );
      const foreignPage = yield* repository.listWorkspaces(
        secondActor,
        yield* Schema.decodeUnknown(ListWorkspacesInput)({ cursor: null, limit: 50 }),
      );

      assert.strictEqual(firstPage.items.length, 1);
      assert.strictEqual(firstPage.items[0]?.id, additionalWorkspace.id);
      assert.strictEqual(secondPage.items[0]?.id, required(firstWorkspace, "first workspace").id);
      assert.strictEqual(foreignPage.items.length, 1);
      assert.strictEqual(
        foreignPage.items[0]?.id,
        required(secondWorkspace, "second workspace").id,
      );
    }),
  );

  it.effect("creates and exactly replays one Control Plane workspace command", () =>
    Effect.gen(function* () {
      const actor = { kind: "user" as const, id: firstActor };
      const input = yield* Schema.decodeUnknown(ControlPlaneCreateWorkspaceRequest)({
        commandId: randomUUID(),
        name: "Control Plane Workspace",
      });
      const initial = yield* repository.createControlPlaneWorkspace(
        actor,
        input,
        "request-m14-workspace-create",
      );
      const replay = yield* repository.createControlPlaneWorkspace(
        actor,
        input,
        "request-m14-workspace-replay",
      );
      const conflict = yield* Effect.exit(
        repository.createControlPlaneWorkspace(
          actor,
          yield* Schema.decodeUnknown(ControlPlaneCreateWorkspaceRequest)({
            ...input,
            name: "Changed Control Plane Workspace",
          }),
          "request-m14-workspace-conflict",
        ),
      );
      const rows = yield* Effect.promise(() =>
        db.select().from(workspace).where(eq(workspace.id, initial.workspace.id)),
      );
      const receipts = yield* Effect.promise(() =>
        db
          .select()
          .from(controlPlaneCommandReceipt)
          .where(eq(controlPlaneCommandReceipt.commandId, input.commandId)),
      );

      assert.isFalse(initial.replayed);
      assert.isTrue(replay.replayed);
      assert.strictEqual(replay.workspace.id, initial.workspace.id);
      assert.strictEqual(failureTag(conflict), "ControlPlaneCommandConflictFailure");
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(receipts.length, 1);
      assert.strictEqual(receipts[0]?.workspaceId, initial.workspace.id);
      assert.strictEqual(receipts[0]?.projectId, null);
    }),
  );

  it.effect("paginates only the actor's Control Plane workspaces", () =>
    Effect.gen(function* () {
      const actor = { kind: "user" as const, id: firstActor };
      const first = yield* repository.listControlPlaneWorkspaces(actor, 1, null);
      assert.strictEqual(first.items.length, 1);
      assert.isNotNull(first.nextPosition);
      if (first.nextPosition === null) return;
      const second = yield* repository.listControlPlaneWorkspaces(actor, 1, first.nextPosition);
      const foreign = yield* repository.listControlPlaneWorkspaces(
        { kind: "user", id: secondActor },
        50,
        null,
      );

      assert.strictEqual(second.items.length, 1);
      assert.notStrictEqual(second.items[0]?.id, first.items[0]?.id);
      assert.isTrue(first.items.every((item) => item.role === "owner"));
      assert.isTrue(foreign.items.every((item) => item.id !== first.items[0]?.id));
    }),
  );

  it.effect(
    "atomically creates a project, explicit owner membership, and primary environment",
    () =>
      Effect.gen(function* () {
        const ownerWorkspace = required(firstWorkspace, "first workspace");
        primaryProject = yield* repository.createProject(
          firstActor,
          yield* Schema.decodeUnknown(CreateProjectInput)({
            workspaceId: ownerWorkspace.id,
            name: "Marketing Site",
            key: "marketing-site",
            description: "secret=must-not-enter-audit",
          }),
          "request-m2-project-create",
        );

        const created = required(primaryProject, "primary project");
        const environments = yield* Effect.promise(() =>
          db.select().from(environment).where(eq(environment.projectId, created.id)),
        );
        const memberships = yield* Effect.promise(() =>
          db.select().from(projectMembership).where(eq(projectMembership.projectId, created.id)),
        );
        const locales = yield* Effect.promise(() =>
          db.select().from(projectLocale).where(eq(projectLocale.projectId, created.id)),
        );
        const audits = yield* Effect.promise(() =>
          db.select().from(auditEvent).where(eq(auditEvent.projectId, created.id)),
        );

        assert.strictEqual(created.environment.key, "main");
        assert.isTrue(created.environment.isPrimary);
        assert.strictEqual(created.capabilities[0]?.status, "disabled");
        assert.strictEqual(environments.length, 1);
        assert.strictEqual(memberships.length, 1);
        assert.strictEqual(memberships[0]?.userId, firstUserId);
        assert.strictEqual(memberships[0]?.role, "owner");
        assert.strictEqual(memberships[0]?.localeAccessMode, "all");
        assert.strictEqual(locales.length, 1);
        assert.strictEqual(locales[0]?.tag, "en");
        assert.strictEqual(locales[0]?.status, "enabled");
        assert.strictEqual(locales[0]?.position, 0);
        assert.deepEqual(audits.map((event) => event.action).sort(), [
          "environment.created",
          "project.created",
          "project.locale.created",
          "project.membership.created",
        ]);
        assert.notInclude(JSON.stringify(audits), "must-not-enter-audit");
      }),
  );

  it.effect("creates initial CMS authority and exactly replays one Control Plane project", () =>
    Effect.gen(function* () {
      const actor = { kind: "user" as const, id: firstActor };
      const input = yield* Schema.decodeUnknown(ControlPlaneCreateProjectRequest)({
        commandId: randomUUID(),
        name: "Control Plane Project",
        key: "control-plane-project",
        description: "Portable bootstrap",
        initialCapabilities: ["cms"],
      });
      const exits = yield* Effect.forEach(
        ["a", "b", "c"],
        (requestSuffix) =>
          Effect.exit(
            repository.createControlPlaneProject(
              actor,
              required(firstWorkspace, "first workspace").id,
              input,
              `request-m14-project-${requestSuffix}`,
            ),
          ),
        { concurrency: 3 },
      );
      const successes = exits.filter(Exit.isSuccess);
      const created = successes[0]?.value.project;
      assert.isDefined(created);
      if (!created) return;
      const conflict = yield* Effect.exit(
        repository.createControlPlaneProject(
          actor,
          required(firstWorkspace, "first workspace").id,
          yield* Schema.decodeUnknown(ControlPlaneCreateProjectRequest)({
            ...input,
            name: "Changed Control Plane Project",
          }),
          "request-m14-project-conflict",
        ),
      );
      const capabilities = yield* Effect.promise(() =>
        db.select().from(projectCapability).where(eq(projectCapability.projectId, created.id)),
      );
      const environments = yield* Effect.promise(() =>
        db.select().from(environment).where(eq(environment.projectId, created.id)),
      );
      const locales = yield* Effect.promise(() =>
        db.select().from(projectLocale).where(eq(projectLocale.projectId, created.id)),
      );
      const receipts = yield* Effect.promise(() =>
        db
          .select()
          .from(controlPlaneCommandReceipt)
          .where(eq(controlPlaneCommandReceipt.commandId, input.commandId)),
      );

      assert.strictEqual(successes.length, 3);
      assert.strictEqual(successes.filter((exit) => exit.value.replayed).length, 2);
      assert.strictEqual(new Set(successes.map((exit) => exit.value.project.id)).size, 1);
      assert.strictEqual(failureTag(conflict), "ControlPlaneCommandConflictFailure");
      assert.strictEqual(created.status, "active");
      assert.includeMembers(
        [...created.effectiveActions],
        [
          "project.read",
          "project.update",
          "project.archive",
          "project.capability.manage",
          "studio_registration.read",
          "studio_registration.write",
        ],
      );
      assert.notInclude(created.effectiveActions, "project.restore");
      assert.strictEqual(capabilities.length, 1);
      assert.strictEqual(capabilities[0]?.status, "enabled");
      assert.strictEqual(environments.length, 1);
      assert.isTrue(environments[0]?.isPrimary ?? false);
      assert.strictEqual(locales.length, 1);
      assert.strictEqual(locales[0]?.tag, "en");
      assert.strictEqual(receipts.length, 1);
      assert.strictEqual(receipts[0]?.projectId, created.id);
    }),
  );

  it.effect("paginates active Control Plane projects without duplication", () =>
    Effect.gen(function* () {
      const actor = { kind: "user" as const, id: firstActor };
      const workspaceId = required(firstWorkspace, "first workspace").id;
      const first = yield* repository.listControlPlaneProjects(
        actor,
        workspaceId,
        "active",
        1,
        null,
      );
      assert.strictEqual(first.items.length, 1);
      assert.isNotNull(first.nextPosition);
      if (first.nextPosition === null) return;
      const second = yield* repository.listControlPlaneProjects(
        actor,
        workspaceId,
        "active",
        1,
        first.nextPosition,
      );

      assert.strictEqual(second.items.length, 1);
      assert.notStrictEqual(second.items[0]?.id, first.items[0]?.id);
      assert.isTrue([...first.items, ...second.items].every((item) => item.status === "active"));
      assert.isTrue(
        [...first.items, ...second.items].every(
          (item) => item.primaryEnvironment.key === "main" && item.capabilities.length === 1,
        ),
      );
    }),
  );

  it.effect("serializes and exactly matches bounded Control Plane command receipts", () =>
    Effect.gen(function* () {
      const created = required(primaryProject, "primary project");
      const expectation: ControlPlaneReceiptExpectation = {
        commandId: ControlPlaneCommandId.make(randomUUID()),
        operation: "project.create",
        actor: { kind: "user", id: firstActor },
        fingerprint: "a".repeat(64),
        workspaceId: created.workspaceId,
        projectId: created.id,
        environmentId: null,
      };
      const inspections = yield* Effect.promise(() =>
        db.transaction(async (transaction) => {
          const missing = await inspectControlPlaneReceipt(transaction, expectation);
          await persistControlPlaneReceipt(
            transaction,
            expectation,
            {
              resourceType: "project",
              resourceId: created.id,
              disposition: "created",
            },
            new Date(),
          );
          const replay = await inspectControlPlaneReceipt(transaction, expectation);
          return { missing, replay };
        }),
      );
      const conflict = yield* Effect.promise(() =>
        db.transaction((transaction) =>
          inspectControlPlaneReceipt(transaction, {
            ...expectation,
            fingerprint: "b".repeat(64),
          }),
        ),
      );

      assert.strictEqual(inspections.missing.kind, "missing");
      assert.deepEqual(inspections.replay, {
        kind: "replay",
        resourceType: "project",
        resourceId: created.id,
        disposition: "created",
      });
      assert.strictEqual(conflict.kind, "conflict");
    }),
  );

  it.effect("applies exact Studio registration create, replay, no-op, and update semantics", () =>
    Effect.gen(function* () {
      const created = required(primaryProject, "primary project");
      const actor = { kind: "user" as const, id: firstActor };
      const createCommandId = randomUUID();
      const createInput = yield* Schema.decodeUnknown(ControlPlanePutStudioRegistrationRequest)({
        commandId: createCommandId,
        expectedVersion: null,
        applicationOrigin: "https://studio.example.test",
        mountPath: "/studio",
      });
      const initial = yield* repository.putStudioRegistration(
        actor,
        created.id,
        created.environment.id,
        createInput,
        "request-m14-studio-create",
      );
      const replay = yield* repository.putStudioRegistration(
        actor,
        created.id,
        created.environment.id,
        createInput,
        "request-m14-studio-replay",
      );
      const commandConflict = yield* Effect.exit(
        repository.putStudioRegistration(
          actor,
          created.id,
          created.environment.id,
          yield* Schema.decodeUnknown(ControlPlanePutStudioRegistrationRequest)({
            ...createInput,
            mountPath: "/changed",
          }),
          "request-m14-studio-command-conflict",
        ),
      );
      const createOnlyConflict = yield* Effect.exit(
        repository.putStudioRegistration(
          actor,
          created.id,
          created.environment.id,
          yield* Schema.decodeUnknown(ControlPlanePutStudioRegistrationRequest)({
            ...createInput,
            commandId: randomUUID(),
          }),
          "request-m14-studio-create-only-conflict",
        ),
      );
      const noOp = yield* repository.putStudioRegistration(
        actor,
        created.id,
        created.environment.id,
        yield* Schema.decodeUnknown(ControlPlanePutStudioRegistrationRequest)({
          ...createInput,
          commandId: randomUUID(),
          expectedVersion: initial.registration.version,
        }),
        "request-m14-studio-noop",
      );
      const updated = yield* repository.putStudioRegistration(
        actor,
        created.id,
        created.environment.id,
        yield* Schema.decodeUnknown(ControlPlanePutStudioRegistrationRequest)({
          ...createInput,
          commandId: randomUUID(),
          expectedVersion: initial.registration.version,
          applicationOrigin: "https://studio-next.example.test",
        }),
        "request-m14-studio-update",
      );
      const stale = yield* Effect.exit(
        repository.putStudioRegistration(
          actor,
          created.id,
          created.environment.id,
          yield* Schema.decodeUnknown(ControlPlanePutStudioRegistrationRequest)({
            ...createInput,
            commandId: randomUUID(),
            expectedVersion: initial.registration.version,
            mountPath: "/new-studio",
          }),
          "request-m14-studio-stale",
        ),
      );
      const loaded = yield* repository.getStudioRegistration(
        actor,
        created.id,
        created.environment.id,
      );
      const receipts = yield* Effect.promise(() =>
        db
          .select()
          .from(controlPlaneCommandReceipt)
          .where(
            and(
              eq(controlPlaneCommandReceipt.projectId, created.id),
              eq(controlPlaneCommandReceipt.operation, "studio_registration.put"),
            ),
          ),
      );
      const audits = yield* Effect.promise(() =>
        db
          .select()
          .from(auditEvent)
          .where(
            and(
              eq(auditEvent.projectId, created.id),
              or(
                eq(auditEvent.action, "studio_registration.created"),
                eq(auditEvent.action, "studio_registration.updated"),
              ),
            ),
          ),
      );
      const [persisted] = yield* Effect.promise(() =>
        db
          .select()
          .from(studioRegistration)
          .where(eq(studioRegistration.id, initial.registration.id))
          .limit(1),
      );

      assert.isTrue(initial.created);
      assert.isFalse(initial.replayed);
      assert.isFalse(initial.noOp);
      assert.isTrue(replay.created);
      assert.isTrue(replay.replayed);
      assert.isTrue(noOp.noOp);
      assert.isFalse(noOp.replayed);
      assert.strictEqual(noOp.registration.version, initial.registration.version);
      assert.strictEqual(updated.registration.version, initial.registration.version + 1);
      assert.strictEqual(loaded.applicationOrigin, "https://studio-next.example.test");
      assert.strictEqual(failureTag(commandConflict), "ControlPlaneCommandConflictFailure");
      assert.strictEqual(failureTag(createOnlyConflict), "VersionConflictFailure");
      assert.strictEqual(failureTag(stale), "VersionConflictFailure");
      assert.strictEqual(receipts.length, 3);
      assert.deepEqual(receipts.map((receipt) => receipt.resultDisposition).sort(), [
        "created",
        "no_op",
        "updated",
      ]);
      assert.strictEqual(audits.length, 2);
      assert.strictEqual(persisted?.createdByUserId, firstUserId);
      assert.strictEqual(persisted?.changedByUserId, firstUserId);
      assert.isNull(persisted?.createdByCredentialId);
      assert.isNull(persisted?.changedByCredentialId);
    }),
  );

  it.effect("serializes singleton Studio registration creation and optimistic updates", () =>
    Effect.gen(function* () {
      const ownerWorkspace = required(firstWorkspace, "first workspace");
      const isolatedProject = yield* repository.createProject(
        firstActor,
        yield* Schema.decodeUnknown(CreateProjectInput)({
          workspaceId: ownerWorkspace.id,
          name: "Concurrent Studio Project",
          key: "concurrent-studio-project",
          description: null,
        }),
        "request-m14-studio-concurrency-project",
      );
      const actor = { kind: "user" as const, id: firstActor };
      const createInputs = yield* Effect.forEach(
        [ControlPlaneCommandId.make(randomUUID()), ControlPlaneCommandId.make(randomUUID())],
        (commandId, index) =>
          Schema.decodeUnknown(ControlPlanePutStudioRegistrationRequest)({
            commandId,
            expectedVersion: null,
            applicationOrigin: `https://studio-${index}.example.test`,
            mountPath: "/studio",
          }),
      );
      const createExits = yield* Effect.forEach(
        createInputs,
        (input, index) =>
          Effect.exit(
            repository.putStudioRegistration(
              actor,
              isolatedProject.id,
              isolatedProject.environment.id,
              input,
              `request-m14-studio-concurrent-create-${index}`,
            ),
          ),
        { concurrency: 2 },
      );
      const created = createExits.find(Exit.isSuccess);
      if (!created || !Exit.isSuccess(created)) {
        return yield* Effect.die(new Error("Concurrent Studio creation produced no success."));
      }
      assert.strictEqual(createExits.filter(Exit.isSuccess).length, 1);
      assert.strictEqual(
        createExits.filter((exit) => failureTag(exit) === "VersionConflictFailure").length,
        1,
      );

      const updateInputs = yield* Effect.forEach(
        [ControlPlaneCommandId.make(randomUUID()), ControlPlaneCommandId.make(randomUUID())],
        (commandId, index) =>
          Schema.decodeUnknown(ControlPlanePutStudioRegistrationRequest)({
            commandId,
            expectedVersion: created.value.registration.version,
            applicationOrigin: `https://updated-studio-${index}.example.test`,
            mountPath: "/studio",
          }),
      );
      const updateExits = yield* Effect.forEach(
        updateInputs,
        (input, index) =>
          Effect.exit(
            repository.putStudioRegistration(
              actor,
              isolatedProject.id,
              isolatedProject.environment.id,
              input,
              `request-m14-studio-concurrent-update-${index}`,
            ),
          ),
        { concurrency: 2 },
      );
      const registrations = yield* Effect.promise(() =>
        db
          .select({ id: studioRegistration.id, version: studioRegistration.version })
          .from(studioRegistration)
          .where(eq(studioRegistration.projectId, isolatedProject.id)),
      );
      const receipts = yield* Effect.promise(() =>
        db
          .select({ commandId: controlPlaneCommandReceipt.commandId })
          .from(controlPlaneCommandReceipt)
          .where(eq(controlPlaneCommandReceipt.projectId, isolatedProject.id)),
      );

      assert.strictEqual(updateExits.filter(Exit.isSuccess).length, 1);
      assert.strictEqual(
        updateExits.filter((exit) => failureTag(exit) === "VersionConflictFailure").length,
        1,
      );
      assert.deepEqual(
        registrations.map(({ version }) => version),
        [2],
      );
      assert.strictEqual(receipts.length, 2);
    }),
  );

  it.effect("uses exact management-credential Studio scope and honest attribution", () =>
    Effect.gen(function* () {
      const created = required(primaryProject, "primary project");
      yield* Effect.promise(() =>
        db.transaction(async (transaction) => {
          await transaction.insert(apiCredential).values({
            id: studioCredentialId,
            workspaceId: created.workspaceId,
            projectId: created.id,
            environmentId: created.environment.id,
            family: "management",
            name: "M14 Studio manager",
            keyPrefix: `ffd_mgmt_${studioCredentialId}`,
            keyDigest: "c".repeat(64),
            createdByUserId: firstUserId,
          });
          await transaction.insert(apiCredentialScope).values([
            {
              credentialId: studioCredentialId,
              workspaceId: created.workspaceId,
              projectId: created.id,
              environmentId: created.environment.id,
              scope: "project.read",
            },
            {
              credentialId: studioCredentialId,
              workspaceId: created.workspaceId,
              projectId: created.id,
              environmentId: created.environment.id,
              scope: "project.update",
            },
          ]);
        }),
      );
      const actor = {
        kind: "credential" as const,
        id: ApiCredentialId.make(studioCredentialId),
      };
      const before = yield* repository.getStudioRegistration(
        actor,
        created.id,
        created.environment.id,
      );
      const result = yield* repository.putStudioRegistration(
        actor,
        created.id,
        created.environment.id,
        yield* Schema.decodeUnknown(ControlPlanePutStudioRegistrationRequest)({
          commandId: randomUUID(),
          expectedVersion: before.version,
          applicationOrigin: before.applicationOrigin,
          mountPath: "/credential-studio",
        }),
        "request-m14-studio-credential-update",
      );
      const [persisted] = yield* Effect.promise(() =>
        db
          .select()
          .from(studioRegistration)
          .where(eq(studioRegistration.id, result.registration.id))
          .limit(1),
      );
      const [audit] = yield* Effect.promise(() =>
        db
          .select()
          .from(auditEvent)
          .where(eq(auditEvent.requestId, "request-m14-studio-credential-update"))
          .limit(1),
      );
      const currentProject = yield* repository.getControlPlaneProject(actor, created.id);
      const updatedProject = yield* repository.updateControlPlaneProject(
        actor,
        created.id,
        yield* Schema.decodeUnknown(ControlPlaneUpdateProjectRequest)({
          expectedVersion: currentProject.version,
          name: "Credential-updated Marketing Site",
          description: currentProject.description,
        }),
        "request-m14-project-credential-update",
      );
      const [projectAudit] = yield* Effect.promise(() =>
        db
          .select()
          .from(auditEvent)
          .where(eq(auditEvent.requestId, "request-m14-project-credential-update"))
          .limit(1),
      );
      primaryProject = yield* repository.getProject(
        firstActor,
        yield* Schema.decodeUnknown(GetProjectInput)({ projectId: created.id }),
      );

      assert.strictEqual(result.registration.mountPath, "/credential-studio");
      assert.strictEqual(persisted?.createdByUserId, firstUserId);
      assert.isNull(persisted?.createdByCredentialId);
      assert.isNull(persisted?.changedByUserId);
      assert.strictEqual(persisted?.changedByCredentialId, studioCredentialId);
      assert.strictEqual(audit?.actorType, "credential");
      assert.strictEqual(audit?.actorId, studioCredentialId);
      assert.strictEqual(updatedProject.version, currentProject.version + 1);
      assert.strictEqual(updatedProject.name, "Credential-updated Marketing Site");
      assert.strictEqual(projectAudit?.actorType, "credential");
      assert.strictEqual(projectAudit?.actorId, studioCredentialId);
    }),
  );

  it.effect("rolls back project and environment when audit creation fails", () =>
    Effect.gen(function* () {
      const ownerWorkspace = required(firstWorkspace, "first workspace");
      const exit = yield* Effect.exit(
        repository.createProject(
          firstActor,
          yield* Schema.decodeUnknown(CreateProjectInput)({
            workspaceId: ownerWorkspace.id,
            name: "Rollback Project",
            key: "rollback-project",
            description: null,
          }),
          "invalid request id",
        ),
      );
      const projects = yield* Effect.promise(() =>
        db
          .select()
          .from(project)
          .where(
            and(eq(project.workspaceId, ownerWorkspace.id), eq(project.key, "rollback-project")),
          ),
      );

      assert.isTrue(Exit.isFailure(exit));
      assert.strictEqual(projects.length, 0);
    }),
  );

  it.effect("enforces project-key uniqueness under concurrency but permits another workspace", () =>
    Effect.gen(function* () {
      const ownerWorkspace = required(firstWorkspace, "first workspace");
      const input = yield* Schema.decodeUnknown(CreateProjectInput)({
        workspaceId: ownerWorkspace.id,
        name: "Concurrent Project",
        key: "concurrent-project",
        description: null,
      });
      const exits = yield* Effect.forEach(
        Array.from({ length: 8 }),
        (_, index) =>
          Effect.exit(
            repository.createProject(firstActor, input, `request-m2-concurrent-${index}`),
          ),
        { concurrency: 8 },
      );
      const sameKeyElsewhere = yield* repository.createProject(
        secondActor,
        yield* Schema.decodeUnknown(CreateProjectInput)({
          workspaceId: required(secondWorkspace, "second workspace").id,
          name: "Concurrent Project",
          key: "concurrent-project",
          description: null,
        }),
        "request-m2-cross-workspace",
      );

      assert.strictEqual(exits.filter(Exit.isSuccess).length, 1);
      assert.strictEqual(
        exits.filter((exit) => failureTag(exit) === "ProjectKeyConflictFailure").length,
        7,
      );
      assert.strictEqual(sameKeyElsewhere.key, "concurrent-project");
    }),
  );

  it.effect(
    "denies cross-tenant read, list, update, lifecycle, and capability access without inference",
    () =>
      Effect.gen(function* () {
        const created = required(primaryProject, "primary project");
        const foreignWorkspace = required(firstWorkspace, "first workspace");
        const exits = yield* Effect.all([
          Effect.exit(
            repository.getProject(
              secondActor,
              yield* Schema.decodeUnknown(GetProjectInput)({ projectId: created.id }),
            ),
          ),
          Effect.exit(
            repository.listProjects(
              secondActor,
              yield* Schema.decodeUnknown(ListProjectsInput)({
                workspaceId: foreignWorkspace.id,
                status: "active",
                cursor: null,
                limit: 20,
              }),
            ),
          ),
          Effect.exit(
            repository.updateProject(
              secondActor,
              yield* Schema.decodeUnknown(UpdateProjectInput)({
                projectId: created.id,
                version: created.version,
                name: "Foreign Update",
                description: null,
              }),
              "request-m2-foreign-update",
            ),
          ),
          Effect.exit(
            repository.archiveProject(
              secondActor,
              yield* Schema.decodeUnknown(ArchiveProjectInput)({
                projectId: created.id,
                version: created.version,
              }),
              "request-m2-foreign-archive",
            ),
          ),
          Effect.exit(
            repository.restoreProject(
              secondActor,
              yield* Schema.decodeUnknown(RestoreProjectInput)({
                projectId: created.id,
                version: created.version,
              }),
              "request-m2-foreign-restore",
            ),
          ),
          Effect.exit(
            repository.enableCapability(
              secondActor,
              yield* Schema.decodeUnknown(EnableCapabilityInput)({
                projectId: created.id,
                capability: "cms",
              }),
              "request-m2-foreign-capability",
            ),
          ),
        ]);

        assert.isTrue(exits.every((exit) => failureTag(exit) === "NotFoundFailure"));
      }),
  );

  it.effect(
    "allows one optimistic update, rejects stale concurrency, and avoids no-op audit noise",
    () =>
      Effect.gen(function* () {
        const created = required(primaryProject, "primary project");
        const firstInput = yield* Schema.decodeUnknown(UpdateProjectInput)({
          projectId: created.id,
          version: created.version,
          name: "Updated Marketing Site",
          description: created.description,
        });
        const secondInput = yield* Schema.decodeUnknown(UpdateProjectInput)({
          projectId: created.id,
          version: created.version,
          name: "Competing Update",
          description: created.description,
        });
        const exits = yield* Effect.forEach(
          [firstInput, secondInput],
          (input, index) =>
            Effect.exit(repository.updateProject(firstActor, input, `request-m2-update-${index}`)),
          { concurrency: 2 },
        );
        const winner = exits.find(Exit.isSuccess);
        assert.isDefined(winner);
        if (!winner || Exit.isFailure(winner)) return;
        primaryProject = winner.value;

        const beforeAudits = yield* Effect.promise(() =>
          db
            .select({ id: auditEvent.id })
            .from(auditEvent)
            .where(
              and(
                eq(auditEvent.projectId, winner.value.id),
                eq(auditEvent.action, "project.updated"),
              ),
            ),
        );
        const noOp = yield* repository.updateProject(
          firstActor,
          yield* Schema.decodeUnknown(UpdateProjectInput)({
            projectId: winner.value.id,
            version: winner.value.version,
            name: winner.value.name,
            description: winner.value.description,
          }),
          "request-m2-noop",
        );
        const afterAudits = yield* Effect.promise(() =>
          db
            .select({ id: auditEvent.id })
            .from(auditEvent)
            .where(
              and(
                eq(auditEvent.projectId, winner.value.id),
                eq(auditEvent.action, "project.updated"),
              ),
            ),
        );

        assert.strictEqual(exits.filter(Exit.isSuccess).length, 1);
        assert.strictEqual(
          exits.filter((exit) => failureTag(exit) === "VersionConflictFailure").length,
          1,
        );
        assert.strictEqual(noOp.version, winner.value.version);
        assert.strictEqual(afterAudits.length, beforeAudits.length);
      }),
  );

  it.effect("enables CMS exactly once under concurrency and records one audit event", () =>
    Effect.gen(function* () {
      const created = required(primaryProject, "primary project");
      const input = yield* Schema.decodeUnknown(EnableCapabilityInput)({
        projectId: created.id,
        capability: "cms",
      });
      const exits = yield* Effect.forEach(
        ["a", "b", "c"],
        (suffixValue) =>
          Effect.exit(
            repository.enableCapability(firstActor, input, `request-m2-capability-${suffixValue}`),
          ),
        { concurrency: 3 },
      );
      const rows = yield* Effect.promise(() =>
        db.select().from(projectCapability).where(eq(projectCapability.projectId, created.id)),
      );
      const audits = yield* Effect.promise(() =>
        db
          .select()
          .from(auditEvent)
          .where(
            and(
              eq(auditEvent.projectId, created.id),
              eq(auditEvent.action, "project.capability.enabled"),
            ),
          ),
      );

      assert.strictEqual(exits.filter(Exit.isSuccess).length, 1);
      assert.strictEqual(
        exits.filter((exit) => failureTag(exit) === "InvalidStateTransitionFailure").length,
        2,
      );
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(audits.length, 1);
    }),
  );

  it.effect("serializes capability receipt replay and leaves no orphan re-enable receipt", () =>
    Effect.gen(function* () {
      const capabilityProject = yield* repository.createProject(
        firstActor,
        yield* Schema.decodeUnknown(CreateProjectInput)({
          workspaceId: required(firstWorkspace, "first workspace").id,
          name: "Control Plane capability project",
          key: "control-plane-capability",
          description: null,
        }),
        "request-m14-capability-project",
      );
      const actor = { kind: "user" as const, id: firstActor };
      const commandId = ControlPlaneCommandId.make(randomUUID());
      const exits = yield* Effect.forEach(
        ["a", "b", "c"],
        (requestSuffix) =>
          Effect.exit(
            repository.enableControlPlaneCapability(
              actor,
              capabilityProject.id,
              commandId,
              `request-m14-capability-${requestSuffix}`,
            ),
          ),
        { concurrency: 3 },
      );
      const reEnableCommandId = ControlPlaneCommandId.make(randomUUID());
      const reEnable = yield* Effect.exit(
        repository.enableControlPlaneCapability(
          actor,
          capabilityProject.id,
          reEnableCommandId,
          "request-m14-capability-re-enable",
        ),
      );
      const receipts = yield* Effect.promise(() =>
        db
          .select()
          .from(controlPlaneCommandReceipt)
          .where(
            and(
              eq(controlPlaneCommandReceipt.projectId, capabilityProject.id),
              eq(controlPlaneCommandReceipt.operation, "project.capability.enable"),
            ),
          ),
      );
      const audits = yield* Effect.promise(() =>
        db
          .select()
          .from(auditEvent)
          .where(
            and(
              eq(auditEvent.projectId, capabilityProject.id),
              eq(auditEvent.action, "project.capability.enabled"),
            ),
          ),
      );
      const successes = exits.filter(Exit.isSuccess);

      assert.strictEqual(successes.length, 3);
      assert.strictEqual(successes.filter((exit) => exit.value.replayed).length, 2);
      assert.strictEqual(successes.filter((exit) => !exit.value.replayed).length, 1);
      assert.strictEqual(failureTag(reEnable), "InvalidStateTransitionFailure");
      assert.strictEqual(receipts.length, 1);
      assert.strictEqual(receipts[0]?.commandId, commandId);
      assert.isFalse(receipts.some((receipt) => receipt.commandId === reEnableCommandId));
      assert.strictEqual(audits.length, 1);
    }),
  );

  it.effect("paginates active projects without duplicate records", () =>
    Effect.gen(function* () {
      const ownerWorkspace = required(firstWorkspace, "first workspace");
      const firstPage = yield* repository.listProjects(
        firstActor,
        yield* Schema.decodeUnknown(ListProjectsInput)({
          workspaceId: ownerWorkspace.id,
          status: "active",
          cursor: null,
          limit: 1,
        }),
      );
      assert.isNotNull(firstPage.nextCursor);
      if (!firstPage.nextCursor) return;
      const secondPage = yield* repository.listProjects(
        firstActor,
        yield* Schema.decodeUnknown(ListProjectsInput)({
          workspaceId: ownerWorkspace.id,
          status: "active",
          cursor: firstPage.nextCursor,
          limit: 1,
        }),
      );
      const ids = [...firstPage.items, ...secondPage.items].map((item) => item.id);

      assert.strictEqual(new Set(ids).size, ids.length);
    }),
  );

  it.effect("archives without cascading state and permanently reserves the project key", () =>
    Effect.gen(function* () {
      const current = required(primaryProject, "primary project");
      const archived = yield* repository.archiveProject(
        firstActor,
        yield* Schema.decodeUnknown(ArchiveProjectInput)({
          projectId: current.id,
          version: current.version,
        }),
        "request-m2-archive",
      );
      primaryProject = archived;
      const environments = yield* Effect.promise(() =>
        db.select().from(environment).where(eq(environment.projectId, archived.id)),
      );
      const capabilities = yield* Effect.promise(() =>
        db.select().from(projectCapability).where(eq(projectCapability.projectId, archived.id)),
      );
      const duplicate = yield* Effect.exit(
        repository.createProject(
          firstActor,
          yield* Schema.decodeUnknown(CreateProjectInput)({
            workspaceId: archived.workspaceId,
            name: "Replacement",
            key: archived.key,
            description: null,
          }),
          "request-m2-reuse-key",
        ),
      );
      const repeatedArchive = yield* Effect.exit(
        repository.archiveProject(
          firstActor,
          yield* Schema.decodeUnknown(ArchiveProjectInput)({
            projectId: archived.id,
            version: archived.version,
          }),
          "request-m2-repeat-archive",
        ),
      );

      assert.isNotNull(archived.archivedAt);
      assert.strictEqual(environments.length, 1);
      assert.strictEqual(capabilities.length, 1);
      assert.strictEqual(failureTag(duplicate), "ProjectKeyConflictFailure");
      assert.strictEqual(failureTag(repeatedArchive), "InvalidStateTransitionFailure");
    }),
  );

  it.effect("restores only the exact archived version and records one safe audit", () =>
    Effect.gen(function* () {
      const archived = required(primaryProject, "primary project");
      const stale = yield* Effect.exit(
        repository.restoreProject(
          firstActor,
          yield* Schema.decodeUnknown(RestoreProjectInput)({
            projectId: archived.id,
            version: archived.version - 1,
          }),
          "request-m2-stale-restore",
        ),
      );
      const restored = yield* repository.restoreProject(
        firstActor,
        yield* Schema.decodeUnknown(RestoreProjectInput)({
          projectId: archived.id,
          version: archived.version,
        }),
        "request-m2-restore",
      );
      primaryProject = restored;
      const [persisted] = yield* Effect.promise(() =>
        db.select().from(project).where(eq(project.id, restored.id)).limit(1),
      );
      const audits = yield* Effect.promise(() =>
        db
          .select()
          .from(auditEvent)
          .where(
            and(eq(auditEvent.projectId, restored.id), eq(auditEvent.action, "project.restored")),
          ),
      );
      const repeated = yield* Effect.exit(
        repository.restoreProject(
          firstActor,
          yield* Schema.decodeUnknown(RestoreProjectInput)({
            projectId: restored.id,
            version: restored.version,
          }),
          "request-m2-repeat-restore",
        ),
      );

      assert.strictEqual(failureTag(stale), "VersionConflictFailure");
      assert.isNull(restored.archivedAt);
      assert.isNull(persisted?.archivedAt);
      assert.isNull(persisted?.archivedByUserId);
      assert.strictEqual(restored.version, archived.version + 1);
      assert.strictEqual(audits.length, 1);
      assert.strictEqual(audits[0]?.requestId, "request-m2-restore");
      assert.strictEqual(failureTag(repeated), "InvalidStateTransitionFailure");
    }),
  );

  it.effect("enforces composite tenant foreign keys", () =>
    Effect.gen(function* () {
      const archived = required(primaryProject, "primary project");
      const foreignWorkspace = required(secondWorkspace, "second workspace");
      const rejected = yield* Effect.tryPromise({
        try: () =>
          db
            .insert(environment)
            .values({
              workspaceId: foreignWorkspace.id,
              projectId: archived.id,
              key: "preview",
              name: "preview",
              isPrimary: false,
              createdByUserId: secondUserId,
            })
            .then(
              () => false,
              () => true,
            ),
        catch: () => false,
      });

      assert.isTrue(rejected);
    }),
  );

  it.effect("keeps receipt growth compact and one-row-per-committed-command", () =>
    Effect.gen(function* () {
      const evidence = yield* Effect.promise(() =>
        db.execute(sql`select
          count(*)::integer as "rowCount",
          coalesce(sum(pg_column_size(r)), 0)::integer as "totalBytes",
          coalesce(max(pg_column_size(r)), 0)::integer as "maximumRowBytes",
          extract(epoch from (max(created_at) - min(created_at))) * 1000 as "ageSpanMs"
          from control_plane_command_receipt r
          where actor_id in (${firstUserId}, ${secondUserId}, ${studioCredentialId})`),
      );
      const row = evidence.rows[0];
      const rowCount = Number(row?.rowCount);
      const totalBytes = Number(row?.totalBytes);
      const maximumRowBytes = Number(row?.maximumRowBytes);
      const ageSpanMs = Number(row?.ageSpanMs ?? 0);
      assert.isAtLeast(rowCount, 7);
      assert.isAbove(totalBytes, 0);
      assert.isAtMost(maximumRowBytes, 512);
      assert.isAtLeast(ageSpanMs, 0);
    }),
  );

  it.effect("uses the intended active and archived project list indexes", () =>
    Effect.gen(function* () {
      const ownerWorkspace = required(firstWorkspace, "first workspace");
      const plans = yield* Effect.promise(() =>
        db.transaction(async (transaction) => {
          await transaction.execute(sql`set local enable_seqscan = off`);
          const active = await transaction.execute(
            sql`explain (format json) select id from project where workspace_id = ${ownerWorkspace.id} and archived_at is null order by created_at desc, id desc limit 20`,
          );
          const archived = await transaction.execute(
            sql`explain (format json) select id from project where workspace_id = ${ownerWorkspace.id} and archived_at is not null order by archived_at desc, id desc limit 20`,
          );
          return JSON.stringify([active.rows, archived.rows]);
        }),
      );

      assert.include(plans, "project_workspace_active_created_id_idx");
      assert.include(plans, "project_workspace_archived_at_id_idx");
    }),
  );
});
