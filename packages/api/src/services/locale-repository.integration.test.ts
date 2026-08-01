import { randomUUID } from "node:crypto";

import { afterAll, assert, beforeAll, describe, it } from "@effect/vitest";
import { db } from "@framerfordevs/db";
import { eq, or, sql } from "@framerfordevs/db/query";
import { projectMembership } from "@framerfordevs/db/schema/access";
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
  ListProjectMembersInput,
  UpdateProjectMemberLocaleAccessInput,
  type ProjectMember,
} from "../contracts/access";
import {
  CreateProjectLocaleInput,
  ListProjectLocalesInput,
  type ProjectLocale as ProjectLocaleModel,
  ReorderProjectLocalesInput,
  UpdateProjectLocaleDisplayNameInput,
  UpdateProjectLocaleStatusInput,
} from "../contracts/locales";
import {
  AuthUserId,
  CreateProjectInput,
  CreateWorkspaceInput,
  type Project as ProjectModel,
  type Workspace as WorkspaceModel,
} from "../contracts/platform";
import { makeAccessRepository } from "./access-repository";
import { makeLocaleRepository } from "./locale-repository";
import { makePlatformRepository } from "./platform-repository";

const suffix = randomUUID();
const ownerId = `m4-locale-owner-${suffix}`;
const developerId = `m4-locale-developer-${suffix}`;
const foreignId = `m4-locale-foreign-${suffix}`;
const ownerActor = Schema.decodeUnknownSync(AuthUserId)(ownerId);
const developerActor = Schema.decodeUnknownSync(AuthUserId)(developerId);
const foreignActor = Schema.decodeUnknownSync(AuthUserId)(foreignId);
const platform = makePlatformRepository();
const locales = makeLocaleRepository();
const access = makeAccessRepository();

let workspaceModel: WorkspaceModel | undefined;
let projectModel: ProjectModel | undefined;
let foreignWorkspace: WorkspaceModel | undefined;
let foreignProject: ProjectModel | undefined;
let developerMember: ProjectMember | undefined;
let hindi: ProjectLocaleModel | undefined;
let gujarati: ProjectLocaleModel | undefined;

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
      name: "M4 Locale Owner",
      email: `m4-locale-owner-${suffix}@example.test`,
      emailVerified: true,
    },
    {
      id: developerId,
      name: "M4 Locale Developer",
      email: `m4-locale-developer-${suffix}@example.test`,
      emailVerified: true,
    },
    {
      id: foreignId,
      name: "M4 Locale Foreign",
      email: `m4-locale-foreign-${suffix}@example.test`,
      emailVerified: true,
    },
  ]);
  workspaceModel = await Effect.runPromise(
    platform.createWorkspace(
      ownerActor,
      Schema.decodeUnknownSync(CreateWorkspaceInput)({ name: "M4 Locale Workspace" }),
      "request-m4-locale-workspace",
    ),
  );
  projectModel = await Effect.runPromise(
    platform.createProject(
      ownerActor,
      Schema.decodeUnknownSync(CreateProjectInput)({
        workspaceId: required(workspaceModel, "workspace").id,
        name: "M4 Locale Project",
        key: `locale-${suffix.slice(0, 8)}`,
        description: null,
      }),
      "request-m4-locale-project",
    ),
  );
  foreignWorkspace = await Effect.runPromise(
    platform.createWorkspace(
      foreignActor,
      Schema.decodeUnknownSync(CreateWorkspaceInput)({ name: "M4 Foreign Workspace" }),
      "request-m4-foreign-workspace",
    ),
  );
  foreignProject = await Effect.runPromise(
    platform.createProject(
      foreignActor,
      Schema.decodeUnknownSync(CreateProjectInput)({
        workspaceId: required(foreignWorkspace, "foreign workspace").id,
        name: "M4 Foreign Project",
        key: `foreign-${suffix.slice(0, 8)}`,
        description: null,
      }),
      "request-m4-foreign-project",
    ),
  );

  await db.insert(workspaceMembership).values({
    workspaceId: required(workspaceModel, "workspace").id,
    userId: developerId,
    role: "collaborator",
  });
  const [membership] = await db
    .insert(projectMembership)
    .values({
      workspaceId: required(workspaceModel, "workspace").id,
      projectId: required(projectModel, "project").id,
      userId: developerId,
      role: "developer",
      createdByUserId: ownerId,
    })
    .returning();
  if (!membership) throw new Error("Developer membership was not created.");
  developerMember = await Effect.runPromise(
    access.listMembers(
      ownerActor,
      Schema.decodeUnknownSync(ListProjectMembersInput)({
        projectId: required(projectModel, "project").id,
        cursor: null,
        limit: 20,
      }),
    ),
  ).then((page) => page.items.find((member) => member.id === membership.id));
});

afterAll(async () => {
  const actorIds = [ownerId, developerId, foreignId];
  await db
    .delete(auditEvent)
    .where(or(...actorIds.map((actorId) => eq(auditEvent.actorId, actorId))));
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
    .delete(environment)
    .where(or(...actorIds.map((actorId) => eq(environment.createdByUserId, actorId))));
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

describe.sequential("locale repository PostgreSQL integration", () => {
  it.effect("starts with exactly one enabled English locale and creates canonical locales", () =>
    Effect.gen(function* () {
      const currentProject = required(projectModel, "project");
      const initial = yield* locales.listLocales(
        ownerActor,
        yield* Schema.decodeUnknown(ListProjectLocalesInput)({
          projectId: currentProject.id,
          view: "settings",
          includeRemoved: true,
        }),
      );
      assert.strictEqual(initial.items.length, 1);
      assert.strictEqual(initial.items[0]?.tag, "en");
      assert.strictEqual(initial.items[0]?.status, "enabled");
      assert.strictEqual(initial.items[0]?.position, 0);

      hindi = yield* locales.createLocale(
        ownerActor,
        yield* Schema.decodeUnknown(CreateProjectLocaleInput)({
          projectId: currentProject.id,
          tag: "HI",
          displayName: "Hindi",
        }),
        new Date(),
        "request-m4-create-hi",
      );
      gujarati = yield* locales.createLocale(
        ownerActor,
        yield* Schema.decodeUnknown(CreateProjectLocaleInput)({
          projectId: currentProject.id,
          tag: "gu",
          displayName: "Gujarati",
        }),
        new Date(),
        "request-m4-create-gu",
      );

      assert.strictEqual(hindi.tag, "hi");
      assert.strictEqual(hindi.position, 1);
      assert.strictEqual(gujarati.position, 2);
      const duplicate = yield* Effect.exit(
        locales.createLocale(
          ownerActor,
          yield* Schema.decodeUnknown(CreateProjectLocaleInput)({
            projectId: currentProject.id,
            tag: "hi",
            displayName: "Duplicate Hindi",
          }),
          new Date(),
          "request-m4-create-hi-duplicate",
        ),
      );
      assert.strictEqual(failureTag(duplicate), "LocaleConflictFailure");
    }),
  );

  it.effect("updates display names optimistically without no-op audit noise", () =>
    Effect.gen(function* () {
      const currentHindi = required(hindi, "Hindi locale");
      const updated = yield* locales.updateDisplayName(
        ownerActor,
        yield* Schema.decodeUnknown(UpdateProjectLocaleDisplayNameInput)({
          localeId: currentHindi.id,
          version: currentHindi.version,
          displayName: "हिन्दी",
        }),
        new Date(),
        "request-m4-rename-hi",
      );
      const noOp = yield* locales.updateDisplayName(
        ownerActor,
        yield* Schema.decodeUnknown(UpdateProjectLocaleDisplayNameInput)({
          localeId: updated.id,
          version: updated.version,
          displayName: updated.displayName,
        }),
        new Date(),
        "request-m4-rename-hi-noop",
      );
      const stale = yield* Effect.exit(
        locales.updateDisplayName(
          ownerActor,
          yield* Schema.decodeUnknown(UpdateProjectLocaleDisplayNameInput)({
            localeId: updated.id,
            version: currentHindi.version,
            displayName: "Stale",
          }),
          new Date(),
          "request-m4-rename-hi-stale",
        ),
      );
      hindi = noOp;

      assert.strictEqual(noOp.version, updated.version);
      assert.strictEqual(failureTag(stale), "VersionConflictFailure");
      const audits = yield* Effect.promise(() =>
        db
          .select()
          .from(auditEvent)
          .where(eq(auditEvent.action, "project.locale.display_name.updated")),
      );
      assert.strictEqual(audits.filter((audit) => audit.resourceId === updated.id).length, 1);
    }),
  );

  it.effect("reorders the complete active set without changing locale identity or tags", () =>
    Effect.gen(function* () {
      const currentProject = required(projectModel, "project");
      const before = yield* locales.listLocales(
        ownerActor,
        yield* Schema.decodeUnknown(ListProjectLocalesInput)({
          projectId: currentProject.id,
          view: "settings",
          includeRemoved: false,
        }),
      );
      const requested = [...before.items].reverse();
      const reordered = yield* locales.reorderLocales(
        ownerActor,
        yield* Schema.decodeUnknown(ReorderProjectLocalesInput)({
          projectId: currentProject.id,
          locales: requested.map((locale) => ({
            localeId: locale.id,
            version: locale.version,
          })),
        }),
        new Date(),
        "request-m4-reorder",
      );

      assert.deepEqual(
        reordered.items.map((locale) => locale.id),
        requested.map((locale) => locale.id),
      );
      assert.deepEqual(
        [...reordered.items].map((locale) => locale.position),
        [0, 1, 2],
      );
      assert.deepEqual(
        new Map(reordered.items.map((locale) => [locale.id, locale.tag])),
        new Map(before.items.map((locale) => [locale.id, locale.tag])),
      );
      hindi = reordered.items.find((locale) => locale.tag === "hi");
      gujarati = reordered.items.find((locale) => locale.tag === "gu");

      const incomplete = yield* Effect.exit(
        locales.reorderLocales(
          ownerActor,
          yield* Schema.decodeUnknown(ReorderProjectLocalesInput)({
            projectId: currentProject.id,
            locales: reordered.items.slice(0, 2).map((locale) => ({
              localeId: locale.id,
              version: locale.version,
            })),
          }),
          new Date(),
          "request-m4-reorder-incomplete",
        ),
      );
      assert.strictEqual(failureTag(incomplete), "LocaleUnavailableFailure");
    }),
  );

  it.effect(
    "rejects English withdrawal and preserves locale identity through removal and restore",
    () =>
      Effect.gen(function* () {
        const currentProject = required(projectModel, "project");
        const settings = yield* locales.listLocales(
          ownerActor,
          yield* Schema.decodeUnknown(ListProjectLocalesInput)({
            projectId: currentProject.id,
            view: "settings",
            includeRemoved: true,
          }),
        );
        const english = settings.items.find((locale) => locale.tag === "en");
        const englishExit = yield* Effect.exit(
          locales.updateStatus(
            ownerActor,
            yield* Schema.decodeUnknown(UpdateProjectLocaleStatusInput)({
              localeId: required(english, "English locale").id,
              version: required(english, "English locale").version,
              status: "disabled",
              confirmDraftImpact: true,
            }),
            new Date(),
            "request-m4-disable-en",
          ),
        );
        assert.strictEqual(failureTag(englishExit), "InvalidStateTransitionFailure");

        const currentGujarati = required(gujarati, "Gujarati locale");
        const removed = yield* locales.updateStatus(
          ownerActor,
          yield* Schema.decodeUnknown(UpdateProjectLocaleStatusInput)({
            localeId: currentGujarati.id,
            version: currentGujarati.version,
            status: "removed",
            confirmDraftImpact: false,
          }),
          new Date(),
          "request-m4-remove-gu",
        );
        const restored = yield* locales.updateStatus(
          ownerActor,
          yield* Schema.decodeUnknown(UpdateProjectLocaleStatusInput)({
            localeId: removed.id,
            version: removed.version,
            status: "enabled",
            confirmDraftImpact: false,
          }),
          new Date(),
          "request-m4-restore-gu",
        );
        gujarati = restored;

        assert.strictEqual(removed.id, currentGujarati.id);
        assert.strictEqual(removed.tag, currentGujarati.tag);
        assert.isNull(removed.position);
        assert.strictEqual(restored.id, currentGujarati.id);
        assert.strictEqual(restored.tag, currentGujarati.tag);
        assert.isNumber(restored.position);
      }),
  );

  it.effect(
    "keeps configured allowlists while disabled and applies exact no-fallback resolution",
    () =>
      Effect.gen(function* () {
        const currentProject = required(projectModel, "project");
        const currentMember = required(developerMember, "developer member");
        const currentHindi = required(hindi, "Hindi locale");
        developerMember = yield* access.updateMemberLocaleAccess(
          ownerActor,
          yield* Schema.decodeUnknown(UpdateProjectMemberLocaleAccessInput)({
            membershipId: currentMember.id,
            version: currentMember.version,
            access: { mode: "selected", localeIds: [currentHindi.id] },
          }),
          new Date(),
          "request-m4-member-hi",
        );

        const selected = yield* locales.listLocales(
          developerActor,
          yield* Schema.decodeUnknown(ListProjectLocalesInput)({
            projectId: currentProject.id,
            view: "enabled",
            includeRemoved: false,
          }),
        );
        assert.deepEqual(
          selected.items.map((locale) => locale.id),
          [currentHindi.id],
        );

        const exact = yield* locales.resolveEnabledLocale(
          developerActor,
          currentProject.id,
          "hi",
          "content.write",
        );
        assert.strictEqual(exact.id, currentHindi.id);
        const noRegionalFallback = yield* Effect.exit(
          locales.resolveEnabledLocale(developerActor, currentProject.id, "hi-IN", "content.write"),
        );
        const otherLocale = yield* Effect.exit(
          locales.resolveEnabledLocale(
            developerActor,
            currentProject.id,
            required(gujarati, "Gujarati locale").tag,
            "content.write",
          ),
        );
        assert.strictEqual(failureTag(noRegionalFallback), "LocaleUnavailableFailure");
        assert.strictEqual(failureTag(otherLocale), "LocaleUnavailableFailure");

        const disabled = yield* locales.updateStatus(
          ownerActor,
          yield* Schema.decodeUnknown(UpdateProjectLocaleStatusInput)({
            localeId: currentHindi.id,
            version: currentHindi.version,
            status: "disabled",
            confirmDraftImpact: false,
          }),
          new Date(),
          "request-m4-disable-hi",
        );
        const unavailable = yield* locales.listLocales(
          developerActor,
          yield* Schema.decodeUnknown(ListProjectLocalesInput)({
            projectId: currentProject.id,
            view: "enabled",
            includeRemoved: false,
          }),
        );
        const configuredRows = yield* Effect.promise(() =>
          db
            .select()
            .from(projectMembershipLocaleAccess)
            .where(
              eq(
                projectMembershipLocaleAccess.membershipId,
                required(developerMember, "developer member").id,
              ),
            ),
        );
        assert.strictEqual(unavailable.items.length, 0);
        assert.strictEqual(configuredRows.length, 1);

        hindi = yield* locales.updateStatus(
          ownerActor,
          yield* Schema.decodeUnknown(UpdateProjectLocaleStatusInput)({
            localeId: disabled.id,
            version: disabled.version,
            status: "enabled",
            confirmDraftImpact: false,
          }),
          new Date(),
          "request-m4-enable-hi",
        );
        const restored = yield* locales.listLocales(
          developerActor,
          yield* Schema.decodeUnknown(ListProjectLocalesInput)({
            projectId: currentProject.id,
            view: "enabled",
            includeRemoved: false,
          }),
        );
        assert.deepEqual(
          restored.items.map((locale) => locale.id),
          [currentHindi.id],
        );
      }),
  );

  it.effect("denies locale management and cross-project locale inference", () =>
    Effect.gen(function* () {
      const currentProject = required(projectModel, "project");
      const denied = yield* Effect.exit(
        locales.createLocale(
          developerActor,
          yield* Schema.decodeUnknown(CreateProjectLocaleInput)({
            projectId: currentProject.id,
            tag: "fr",
            displayName: "French",
          }),
          new Date(),
          "request-m4-restricted-manage",
        ),
      );
      const foreign = yield* Effect.exit(
        locales.listLocales(
          foreignActor,
          yield* Schema.decodeUnknown(ListProjectLocalesInput)({
            projectId: currentProject.id,
            view: "enabled",
            includeRemoved: false,
          }),
        ),
      );
      const ownerForeign = yield* Effect.exit(
        locales.listLocales(
          ownerActor,
          yield* Schema.decodeUnknown(ListProjectLocalesInput)({
            projectId: required(foreignProject, "foreign project").id,
            view: "settings",
            includeRemoved: true,
          }),
        ),
      );

      assert.strictEqual(failureTag(denied), "ForbiddenFailure");
      assert.strictEqual(failureTag(foreign), "NotFoundFailure");
      assert.strictEqual(failureTag(ownerForeign), "NotFoundFailure");
    }),
  );

  it.effect("serializes same-tag creation and uses intended locale indexes", () =>
    Effect.gen(function* () {
      const currentProject = required(projectModel, "project");
      const input = yield* Schema.decodeUnknown(CreateProjectLocaleInput)({
        projectId: currentProject.id,
        tag: "en-GB",
        displayName: "British English",
      });
      const exits = yield* Effect.all(
        [
          Effect.exit(
            locales.createLocale(ownerActor, input, new Date(), "request-m4-en-gb-first"),
          ),
          Effect.exit(
            locales.createLocale(ownerActor, input, new Date(), "request-m4-en-gb-second"),
          ),
        ],
        { concurrency: 2 },
      );
      assert.strictEqual(exits.filter(Exit.isSuccess).length, 1);
      assert.strictEqual(
        exits.filter((exit) => failureTag(exit) === "LocaleConflictFailure").length,
        1,
      );

      const plans = yield* Effect.promise(() =>
        db.transaction(async (transaction) => {
          await transaction.execute(sql`set local enable_seqscan = off`);
          const orderedPlan = await transaction.execute(
            sql`explain (format json) select id, tag from project_locale where project_id = ${currentProject.id} and status <> 'removed' order by position, id`,
          );
          const exactPlan = await transaction.execute(
            sql`explain (format json) select id from project_locale where project_id = ${currentProject.id} and lower(tag) = lower('hi')`,
          );
          return JSON.stringify([orderedPlan.rows, exactPlan.rows]);
        }),
      );
      assert.include(plans, "project_locale_project_active_position_id_idx");
      assert.include(plans, "project_locale_project_tag_ci_unique");
    }),
  );

  it.effect("rejects cross-tenant allowlist rows at the database boundary", () =>
    Effect.gen(function* () {
      const currentMember = required(developerMember, "developer member");
      const foreignEnglish = yield* Effect.promise(() =>
        db
          .select()
          .from(projectLocale)
          .where(eq(projectLocale.projectId, required(foreignProject, "foreign project").id))
          .limit(1),
      );
      const exit = yield* Effect.exit(
        Effect.promise(() =>
          db.insert(projectMembershipLocaleAccess).values({
            membershipId: currentMember.id,
            workspaceId: required(workspaceModel, "workspace").id,
            projectId: required(projectModel, "project").id,
            localeId: required(foreignEnglish[0], "foreign English locale").id,
          }),
        ),
      );

      assert.isTrue(Exit.isFailure(exit));
    }),
  );
});
