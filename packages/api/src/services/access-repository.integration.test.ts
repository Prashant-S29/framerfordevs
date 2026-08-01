import { createHash, randomUUID } from "node:crypto";

import { afterAll, assert, beforeAll, describe, it } from "@effect/vitest";
import { db } from "@framerfordevs/db";
import { and, eq, or, sql } from "@framerfordevs/db/query";
import { projectInvitation, projectMembership } from "@framerfordevs/db/schema/access";
import { user } from "@framerfordevs/db/schema/auth";
import { projectLocale, projectMembershipLocaleAccess } from "@framerfordevs/db/schema/locale";
import {
  auditEvent,
  environment,
  project,
  workspace,
  workspaceMembership,
} from "@framerfordevs/db/schema/platform";
import { Cause, Effect, Exit, Option, Schema } from "effect";

import {
  CanonicalEmail,
  CreateProjectInvitationInput,
  ListProjectInvitationsInput,
  ListProjectMembersInput,
  RemoveProjectMemberInput,
  UpdateProjectMemberLocaleAccessInput,
  UpdateProjectMemberRoleInput,
} from "../contracts/access";
import {
  ArchiveProjectInput,
  AuthUserId,
  CreateProjectInput,
  CreateWorkspaceInput,
  GetProjectInput,
  ListProjectsInput,
  ListWorkspacesInput,
  type Project as ProjectModel,
  UpdateProjectInput,
  type Workspace as WorkspaceModel,
} from "../contracts/platform";
import { makePlatformRepository } from "./platform-repository";
import { makeAccessRepository } from "./access-repository";

const suffix = randomUUID();
const ownerId = `m3-owner-${suffix}`;
const developerId = `m3-developer-${suffix}`;
const secondOwnerId = `m3-second-owner-${suffix}`;
const foreignId = `m3-foreign-${suffix}`;
const ownerEmail = `m3-owner-${suffix}@example.test`;
const developerEmail = `m3-developer-${suffix}@example.test`;
const secondOwnerEmail = `m3-second-owner-${suffix}@example.test`;
const foreignEmail = `m3-foreign-${suffix}@example.test`;
const ownerActor = Schema.decodeUnknownSync(AuthUserId)(ownerId);
const developerActor = Schema.decodeUnknownSync(AuthUserId)(developerId);
const secondOwnerActor = Schema.decodeUnknownSync(AuthUserId)(secondOwnerId);
const foreignActor = Schema.decodeUnknownSync(AuthUserId)(foreignId);
const developerCanonicalEmail = Schema.decodeUnknownSync(CanonicalEmail)(developerEmail);
const secondOwnerCanonicalEmail = Schema.decodeUnknownSync(CanonicalEmail)(secondOwnerEmail);
const foreignCanonicalEmail = Schema.decodeUnknownSync(CanonicalEmail)(foreignEmail);
const platform = makePlatformRepository();
const access = makeAccessRepository();

let workspaceModel: WorkspaceModel | undefined;
let projectModel: ProjectModel | undefined;
let developerMembershipId: string | undefined;
let developerMembershipVersion: number | undefined;
let secondOwnerMembershipId: string | undefined;
let secondOwnerMembershipVersion: number | undefined;

function required<A>(value: A | undefined, label: string): A {
  if (value === undefined) throw new Error(`${label} is not initialized.`);
  return value;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
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
    { id: ownerId, name: "M3 Owner", email: ownerEmail, emailVerified: true },
    { id: developerId, name: "M3 Developer", email: developerEmail, emailVerified: true },
    { id: secondOwnerId, name: "M3 Second Owner", email: secondOwnerEmail, emailVerified: true },
    { id: foreignId, name: "M3 Foreign", email: foreignEmail, emailVerified: true },
  ]);
});

afterAll(async () => {
  const actorIds = [ownerId, developerId, secondOwnerId, foreignId];
  await db
    .delete(auditEvent)
    .where(or(...actorIds.map((actorId) => eq(auditEvent.actorId, actorId))));
  await db
    .delete(projectInvitation)
    .where(or(...actorIds.map((actorId) => eq(projectInvitation.invitedByUserId, actorId))));
  await db
    .delete(environment)
    .where(or(...actorIds.map((actorId) => eq(environment.createdByUserId, actorId))));
  const membershipRows = await db
    .select({ id: projectMembership.id })
    .from(projectMembership)
    .where(or(...actorIds.map((actorId) => eq(projectMembership.userId, actorId))));
  if (membershipRows.length > 0) {
    await db
      .delete(projectMembershipLocaleAccess)
      .where(
        or(...membershipRows.map(({ id }) => eq(projectMembershipLocaleAccess.membershipId, id))),
      );
  }
  await db
    .delete(projectLocale)
    .where(or(...actorIds.map((actorId) => eq(projectLocale.createdByUserId, actorId))));
  await db
    .delete(projectMembership)
    .where(or(...actorIds.map((actorId) => eq(projectMembership.userId, actorId))));
  await db
    .delete(project)
    .where(or(...actorIds.map((actorId) => eq(project.createdByUserId, actorId))));
  await db
    .delete(workspaceMembership)
    .where(or(...actorIds.map((actorId) => eq(workspaceMembership.userId, actorId))));
  await db
    .delete(workspace)
    .where(or(...actorIds.map((actorId) => eq(workspace.createdByUserId, actorId))));
  await db.delete(user).where(or(...actorIds.map((actorId) => eq(user.id, actorId))));
  await db.$client.end();
});

describe.sequential("access repository PostgreSQL integration", () => {
  it.effect("creates a project with its explicit owner membership", () =>
    Effect.gen(function* () {
      workspaceModel = yield* platform.createWorkspace(
        ownerActor,
        yield* Schema.decodeUnknown(CreateWorkspaceInput)({ name: "M3 Workspace" }),
        "request-m3-workspace",
      );
      projectModel = yield* platform.createProject(
        ownerActor,
        yield* Schema.decodeUnknown(CreateProjectInput)({
          workspaceId: required(workspaceModel, "workspace").id,
          name: "M3 Project",
          key: `m3-${suffix.slice(0, 8)}`,
          description: null,
        }),
        "request-m3-project",
      );
      const memberships = yield* Effect.promise(() =>
        db
          .select()
          .from(projectMembership)
          .where(eq(projectMembership.projectId, required(projectModel, "project").id)),
      );
      assert.strictEqual(memberships.length, 1);
      assert.strictEqual(memberships[0]?.role, "owner");
    }),
  );

  it.effect("creates, safely inspects, and uniquely constrains pending invitations", () =>
    Effect.gen(function* () {
      const currentProject = required(projectModel, "project");
      const input = yield* Schema.decodeUnknown(CreateProjectInvitationInput)({
        projectId: currentProject.id,
        email: developerEmail,
        role: "developer",
      });
      const now = new Date();
      const tokenDigest = digest(`developer-${suffix}`);
      const created = yield* access.createInvitation(
        ownerActor,
        input,
        tokenDigest,
        now,
        new Date(now.getTime() + 60_000),
        "request-m3-invite-developer",
      );
      const duplicate = yield* Effect.exit(
        access.createInvitation(
          ownerActor,
          input,
          digest(`developer-duplicate-${suffix}`),
          now,
          new Date(now.getTime() + 60_000),
          "request-m3-invite-duplicate",
        ),
      );
      const foreignInspect = yield* Effect.exit(
        access.inspectInvitation(foreignCanonicalEmail, tokenDigest, now),
      );
      const inspected = yield* access.inspectInvitation(developerCanonicalEmail, tokenDigest, now);

      assert.strictEqual(created.status, "pending");
      assert.strictEqual(failureTag(duplicate), "InvitationConflictFailure");
      assert.strictEqual(failureTag(foreignInspect), "InvitationInvalidFailure");
      assert.strictEqual(inspected.projectId, currentProject.id);
      assert.strictEqual(inspected.role, "developer");
      assert.notInclude(JSON.stringify(inspected), developerEmail);
    }),
  );

  it.effect("accepts an invitation exactly once under concurrency and creates one membership", () =>
    Effect.gen(function* () {
      const currentProject = required(projectModel, "project");
      const tokenDigest = digest(`developer-${suffix}`);
      const now = new Date();
      const exits = yield* Effect.forEach(
        Array.from({ length: 6 }),
        (_, index) =>
          Effect.exit(
            access.acceptInvitation(
              developerActor,
              developerCanonicalEmail,
              tokenDigest,
              now,
              `request-m3-accept-${index}`,
            ),
          ),
        { concurrency: 6 },
      );
      const memberships = yield* Effect.promise(() =>
        db
          .select()
          .from(projectMembership)
          .where(
            and(
              eq(projectMembership.projectId, currentProject.id),
              eq(projectMembership.userId, developerId),
            ),
          ),
      );
      const accepted = exits.find(Exit.isSuccess);
      assert.isDefined(accepted);
      if (!accepted || Exit.isFailure(accepted)) return;
      developerMembershipId = accepted.value.id;
      developerMembershipVersion = accepted.value.version;

      assert.strictEqual(exits.filter(Exit.isSuccess).length, 1);
      assert.strictEqual(
        exits.filter((exit) => failureTag(exit) === "InvitationInvalidFailure").length,
        5,
      );
      assert.strictEqual(memberships.length, 1);
      assert.strictEqual(memberships[0]?.role, "developer");
      const workspaceRows = yield* Effect.promise(() =>
        db
          .select()
          .from(workspaceMembership)
          .where(
            and(
              eq(workspaceMembership.workspaceId, currentProject.workspaceId),
              eq(workspaceMembership.userId, developerId),
            ),
          ),
      );
      assert.strictEqual(workspaceRows[0]?.role, "collaborator");
      assert.isNull(workspaceRows[0]?.revokedAt ?? null);
    }),
  );

  it.effect(
    "applies project role policy to existing platform reads, lists, updates, and archive denial",
    () =>
      Effect.gen(function* () {
        const currentProject = required(projectModel, "project");
        const loaded = yield* platform.getProject(
          developerActor,
          yield* Schema.decodeUnknown(GetProjectInput)({ projectId: currentProject.id }),
        );
        const workspaces = yield* platform.listWorkspaces(
          developerActor,
          yield* Schema.decodeUnknown(ListWorkspacesInput)({ cursor: null, limit: 20 }),
        );
        const projects = yield* platform.listProjects(
          developerActor,
          yield* Schema.decodeUnknown(ListProjectsInput)({
            workspaceId: currentProject.workspaceId,
            status: "active",
            cursor: null,
            limit: 20,
          }),
        );
        const updated = yield* platform.updateProject(
          developerActor,
          yield* Schema.decodeUnknown(UpdateProjectInput)({
            projectId: currentProject.id,
            version: currentProject.version,
            name: "M3 Project Updated By Developer",
            description: null,
          }),
          "request-m3-developer-update",
        );
        projectModel = updated;
        const archiveDenied = yield* Effect.exit(
          platform.archiveProject(
            developerActor,
            yield* Schema.decodeUnknown(ArchiveProjectInput)({
              projectId: updated.id,
              version: updated.version,
            }),
            "request-m3-developer-archive",
          ),
        );

        assert.strictEqual(loaded.id, currentProject.id);
        assert.strictEqual(workspaces.items[0]?.role, "collaborator");
        assert.strictEqual(projects.items[0]?.id, currentProject.id);
        assert.strictEqual(updated.name, "M3 Project Updated By Developer");
        assert.strictEqual(failureTag(archiveDenied), "ForbiddenFailure");
      }),
  );

  it.effect("distinguishes known forbidden members from unrelated users without enumeration", () =>
    Effect.gen(function* () {
      const currentProject = required(projectModel, "project");
      const developerList = yield* access.listMembers(
        developerActor,
        yield* Schema.decodeUnknown(ListProjectMembersInput)({
          projectId: currentProject.id,
          cursor: null,
          limit: 20,
        }),
      );
      const deniedInvite = yield* Effect.exit(
        access.createInvitation(
          developerActor,
          yield* Schema.decodeUnknown(CreateProjectInvitationInput)({
            projectId: currentProject.id,
            email: foreignEmail,
            role: "editor",
          }),
          digest(`denied-${suffix}`),
          new Date(),
          new Date(Date.now() + 60_000),
          "request-m3-denied-invite",
        ),
      );
      const foreignList = yield* Effect.exit(
        access.listMembers(
          foreignActor,
          yield* Schema.decodeUnknown(ListProjectMembersInput)({
            projectId: currentProject.id,
            cursor: null,
            limit: 20,
          }),
        ),
      );

      assert.strictEqual(developerList.items.length, 2);
      assert.strictEqual(failureTag(deniedInvite), "ForbiddenFailure");
      assert.strictEqual(failureTag(foreignList), "NotFoundFailure");
    }),
  );

  it.effect("updates roles optimistically and immediately removes collaborator access", () =>
    Effect.gen(function* () {
      const membershipId = required(developerMembershipId, "developer membership");
      const version = required(developerMembershipVersion, "developer membership version");
      const updated = yield* access.updateMemberRole(
        ownerActor,
        yield* Schema.decodeUnknown(UpdateProjectMemberRoleInput)({
          membershipId,
          version,
          role: "editor",
        }),
        new Date(),
        "request-m3-role-update",
      );
      developerMembershipVersion = updated.version;
      const deniedList = yield* Effect.exit(
        access.listMembers(
          developerActor,
          yield* Schema.decodeUnknown(ListProjectMembersInput)({
            projectId: required(projectModel, "project").id,
            cursor: null,
            limit: 20,
          }),
        ),
      );
      const stale = yield* Effect.exit(
        access.updateMemberRole(
          ownerActor,
          yield* Schema.decodeUnknown(UpdateProjectMemberRoleInput)({
            membershipId,
            version,
            role: "reviewer",
          }),
          new Date(),
          "request-m3-role-stale",
        ),
      );
      assert.strictEqual(updated.role, "editor");
      assert.strictEqual(failureTag(deniedList), "ForbiddenFailure");
      const deniedProjectUpdate = yield* Effect.exit(
        platform.updateProject(
          developerActor,
          yield* Schema.decodeUnknown(UpdateProjectInput)({
            projectId: required(projectModel, "project").id,
            version: required(projectModel, "project").version,
            name: "Denied editor update",
            description: null,
          }),
          "request-m3-editor-project-update",
        ),
      );
      assert.strictEqual(failureTag(deniedProjectUpdate), "ForbiddenFailure");
      assert.strictEqual(failureTag(stale), "VersionConflictFailure");

      const removed = yield* access.removeMember(
        ownerActor,
        yield* Schema.decodeUnknown(RemoveProjectMemberInput)({
          membershipId,
          version: updated.version,
        }),
        new Date(),
        "request-m3-member-remove",
      );
      assert.isNotNull(removed.removedAt);
      const removedAccess = yield* Effect.exit(
        access.listMembers(
          developerActor,
          yield* Schema.decodeUnknown(ListProjectMembersInput)({
            projectId: required(projectModel, "project").id,
            cursor: null,
            limit: 20,
          }),
        ),
      );
      assert.strictEqual(failureTag(removedAccess), "NotFoundFailure");
      const [workspaceRow] = yield* Effect.promise(() =>
        db.select().from(workspaceMembership).where(eq(workspaceMembership.userId, developerId)),
      );
      assert.isNotNull(workspaceRow?.revokedAt ?? null);
    }),
  );

  it.effect("reactivates stable collaborator and project membership identities", () =>
    Effect.gen(function* () {
      const currentProject = required(projectModel, "project");
      const now = new Date();
      const tokenDigest = digest(`developer-reinvite-${suffix}`);
      yield* access.createInvitation(
        ownerActor,
        yield* Schema.decodeUnknown(CreateProjectInvitationInput)({
          projectId: currentProject.id,
          email: developerEmail,
          role: "reviewer",
        }),
        tokenDigest,
        now,
        new Date(now.getTime() + 60_000),
        "request-m3-reinvite",
      );
      const accepted = yield* access.acceptInvitation(
        developerActor,
        developerCanonicalEmail,
        tokenDigest,
        now,
        "request-m3-reaccept",
      );
      assert.strictEqual(accepted.id, required(developerMembershipId, "developer membership"));
      developerMembershipVersion = accepted.version;
      assert.strictEqual(accepted.role, "reviewer");
      assert.strictEqual(accepted.localeAccess.mode, "all");
      assert.isNull(accepted.removedAt);
    }),
  );

  it.effect("resets locale access on owner promotion and retains all access on demotion", () =>
    Effect.gen(function* () {
      const currentProject = required(projectModel, "project");
      const membershipId = required(developerMembershipId, "developer membership");
      const [english] = yield* Effect.promise(() =>
        db
          .select()
          .from(projectLocale)
          .where(and(eq(projectLocale.projectId, currentProject.id), eq(projectLocale.tag, "en")))
          .limit(1),
      );
      assert.isDefined(english);
      if (!english) return;
      const selected = yield* access.updateMemberLocaleAccess(
        ownerActor,
        yield* Schema.decodeUnknown(UpdateProjectMemberLocaleAccessInput)({
          membershipId,
          version: required(developerMembershipVersion, "developer version"),
          access: { mode: "selected", localeIds: [english.id] },
        }),
        new Date(),
        "request-m4-member-selected",
      );
      const promoted = yield* access.updateMemberRole(
        ownerActor,
        yield* Schema.decodeUnknown(UpdateProjectMemberRoleInput)({
          membershipId,
          version: selected.version,
          role: "owner",
        }),
        new Date(),
        "request-m4-member-promote-owner",
      );
      const configuredRows = yield* Effect.promise(() =>
        db
          .select()
          .from(projectMembershipLocaleAccess)
          .where(eq(projectMembershipLocaleAccess.membershipId, membershipId)),
      );
      const demoted = yield* access.updateMemberRole(
        ownerActor,
        yield* Schema.decodeUnknown(UpdateProjectMemberRoleInput)({
          membershipId,
          version: promoted.version,
          role: "reviewer",
        }),
        new Date(),
        "request-m4-member-demote-owner",
      );
      developerMembershipVersion = demoted.version;

      assert.strictEqual(promoted.localeAccess.mode, "all");
      assert.strictEqual(configuredRows.length, 0);
      assert.strictEqual(demoted.localeAccess.mode, "all");
    }),
  );

  it.effect("serializes owner mutations and never permits removal of the last explicit owner", () =>
    Effect.gen(function* () {
      const currentProject = required(projectModel, "project");
      const now = new Date();
      const tokenDigest = digest(`second-owner-${suffix}`);
      yield* access.createInvitation(
        ownerActor,
        yield* Schema.decodeUnknown(CreateProjectInvitationInput)({
          projectId: currentProject.id,
          email: secondOwnerEmail,
          role: "owner",
        }),
        tokenDigest,
        now,
        new Date(now.getTime() + 60_000),
        "request-m3-invite-second-owner",
      );
      const accepted = yield* access.acceptInvitation(
        secondOwnerActor,
        secondOwnerCanonicalEmail,
        tokenDigest,
        now,
        "request-m3-accept-second-owner",
      );
      secondOwnerMembershipId = accepted.id;
      secondOwnerMembershipVersion = accepted.version;

      const [originalOwner] = yield* Effect.promise(() =>
        db
          .select()
          .from(projectMembership)
          .where(
            and(
              eq(projectMembership.projectId, currentProject.id),
              eq(projectMembership.userId, ownerId),
            ),
          ),
      );
      assert.isDefined(originalOwner);
      if (!originalOwner) return;
      yield* access.updateMemberRole(
        ownerActor,
        yield* Schema.decodeUnknown(UpdateProjectMemberRoleInput)({
          membershipId: originalOwner.id,
          version: originalOwner.version,
          role: "developer",
        }),
        new Date(),
        "request-m3-demote-original-owner",
      );
      const lastOwnerRemoval = yield* Effect.exit(
        access.removeMember(
          ownerActor,
          yield* Schema.decodeUnknown(RemoveProjectMemberInput)({
            membershipId: required(secondOwnerMembershipId, "second owner membership"),
            version: required(secondOwnerMembershipVersion, "second owner version"),
          }),
          new Date(),
          "request-m3-remove-last-owner",
        ),
      );
      assert.strictEqual(failureTag(lastOwnerRemoval), "LastOwnerRequiredFailure");
      const activeOwners = yield* Effect.promise(() =>
        db
          .select()
          .from(projectMembership)
          .where(
            and(
              eq(projectMembership.projectId, currentProject.id),
              eq(projectMembership.role, "owner"),
            ),
          ),
      );
      assert.strictEqual(activeOwners.filter((row) => row.removedAt === null).length, 1);
    }),
  );

  it.effect("uses the intended active member and invitation timeline indexes", () =>
    Effect.gen(function* () {
      const currentProject = required(projectModel, "project");
      const plans = yield* Effect.promise(() =>
        db.transaction(async (transaction) => {
          await transaction.execute(sql`set local enable_seqscan = off`);
          const members = await transaction.execute(
            sql`explain (format json) select id from project_membership where project_id = ${currentProject.id} and removed_at is null order by created_at desc nulls last, id desc nulls last limit 20`,
          );
          const invitations = await transaction.execute(
            sql`explain (format json) select id from project_invitation where project_id = ${currentProject.id} and status = 'accepted' order by created_at desc nulls last, id desc nulls last limit 20`,
          );
          return JSON.stringify([members.rows, invitations.rows]);
        }),
      );

      assert.include(plans, "project_membership_project_active_created_id_idx");
      assert.include(plans, "project_invitation_project_status_created_id_idx");
    }),
  );

  it.effect(
    "paginates invitations and members without duplicate identities and keeps audits secret-free",
    () =>
      Effect.gen(function* () {
        const currentProject = required(projectModel, "project");
        const memberPage = yield* access.listMembers(
          ownerActor,
          yield* Schema.decodeUnknown(ListProjectMembersInput)({
            projectId: currentProject.id,
            cursor: null,
            limit: 1,
          }),
        );
        const invitationPage = yield* access.listInvitations(
          ownerActor,
          yield* Schema.decodeUnknown(ListProjectInvitationsInput)({
            projectId: currentProject.id,
            cursor: null,
            limit: 1,
          }),
          new Date(),
        );
        assert.isNotNull(memberPage.nextCursor);
        assert.isNotNull(invitationPage.nextCursor);

        const audits = yield* Effect.promise(() =>
          db.select().from(auditEvent).where(eq(auditEvent.projectId, currentProject.id)),
        );
        const serialized = JSON.stringify(audits);
        assert.notInclude(serialized, developerEmail);
        assert.notInclude(serialized, digest(`developer-${suffix}`));
      }),
  );
});
