import { assert, describe, layer } from "@effect/vitest";
import { Effect, Layer, Schema } from "effect";

import {
  AcceptProjectInvitationInput,
  CreateProjectInvitationInput,
  CurrentProjectAccess,
  GetCurrentProjectAccessInput,
  InspectProjectInvitationInput,
  InspectedProjectInvitation,
  IssuedProjectInvitation,
  ListProjectInvitationsInput,
  ListProjectMembersInput,
  ProjectInvitation,
  ProjectInvitationPage,
  ProjectMember,
  ProjectMemberPage,
  RemoveProjectMemberInput,
  RevokeProjectInvitationInput,
  UpdateProjectMemberPolicyInput,
} from "../../contracts/access";
import { AccessRepository, makeAccessRepository } from "../../services/access-repository";
import { SecretGenerator, makeSecretGenerator } from "../../services/secret-generator";
import {
  acceptProjectInvitation,
  createProjectInvitation,
  getCurrentProjectAccess,
  inspectProjectInvitation,
  listProjectInvitations,
  listProjectMembers,
  removeProjectMember,
  revokeProjectInvitation,
  updateProjectMemberPolicy,
} from "./index";

const projectId = "019fae8b-1234-7000-8000-000000000001";
const membershipId = "019fae8b-1234-7000-8000-000000000002";
const invitationId = "019fae8b-1234-7000-8000-000000000003";
const token = "A".repeat(43);
const timestamp = "2026-07-30T12:00:00.000Z";
const member = Schema.decodeUnknownSync(ProjectMember)({
  id: membershipId,
  projectId,
  userId: "user-1",
  name: "Test Member",
  email: "member@example.test",
  role: "owner",
  localeAccess: { mode: "all" },
  version: 1,
  removedAt: null,
  createdAt: timestamp,
  updatedAt: timestamp,
});
const invitation = Schema.decodeUnknownSync(ProjectInvitation)({
  id: invitationId,
  projectId,
  email: "member@example.test",
  role: "editor",
  localeAccess: { mode: "all" },
  status: "pending",
  version: 1,
  expiresAt: "2026-08-06T12:00:00.000Z",
  acceptedAt: null,
  revokedAt: null,
  createdAt: timestamp,
  updatedAt: timestamp,
});
const inspected = Schema.decodeUnknownSync(InspectedProjectInvitation)({
  projectId,
  projectName: "Test Project",
  role: "editor",
  localeAccess: { mode: "all" },
  inviterName: "Test Owner",
  expiresAt: invitation.expiresAt,
});
const currentAccess = Schema.decodeUnknownSync(CurrentProjectAccess)({
  projectId,
  role: "owner",
  localeAccess: { mode: "all" },
  baseRoleActions: ["project.read", "project.member.invite"],
  effectiveProjectActions: ["project.read", "project.member.invite"],
  effectiveLocaleIds: [],
  effectiveLocaleActions: [],
});
const memberPage = ProjectMemberPage.make({ items: [member], nextCursor: null });
const invitationPage = ProjectInvitationPage.make({ items: [invitation], nextCursor: null });
const calls: Array<string> = [];

const AccessRepositoryTest = Layer.succeed(AccessRepository, {
  ...makeAccessRepository(),
  getCurrentAccess: () => Effect.sync(() => (calls.push("getCurrentAccess"), currentAccess)),
  createInvitation: () => Effect.sync(() => (calls.push("createInvitation"), invitation)),
  listInvitations: () => Effect.sync(() => (calls.push("listInvitations"), invitationPage)),
  inspectInvitation: () => Effect.sync(() => (calls.push("inspectInvitation"), inspected)),
  acceptInvitation: () => Effect.sync(() => (calls.push("acceptInvitation"), member)),
  revokeInvitation: () => Effect.sync(() => (calls.push("revokeInvitation"), invitation)),
  listMembers: () => Effect.sync(() => (calls.push("listMembers"), memberPage)),
  updateMemberPolicy: () => Effect.sync(() => (calls.push("updateMemberPolicy"), member)),
  removeMember: () => Effect.sync(() => (calls.push("removeMember"), member)),
});

const SecretGeneratorTest = Layer.succeed(SecretGenerator, {
  ...makeSecretGenerator(),
  generateInvitationToken: () =>
    Effect.succeed(Schema.decodeUnknownSync(InspectProjectInvitationInput)({ token }).token),
  digest: () => Effect.succeed("a".repeat(64)),
});

const AccessOperationTest = Layer.mergeAll(AccessRepositoryTest, SecretGeneratorTest);

describe("access operations", () => {
  layer(AccessOperationTest)((it) => {
    it.effect(
      "forwards every invitation and membership workflow through replaceable services",
      () =>
        Effect.gen(function* () {
          calls.length = 0;
          const actor = "user-1";
          const email = "member@example.test";
          const requestId = "request-access-operations";

          const issued = yield* createProjectInvitation(
            actor,
            yield* Schema.decodeUnknown(CreateProjectInvitationInput)({
              projectId,
              email,
              role: "editor",
              localeAccess: { mode: "all" },
            }),
            requestId,
          );
          assert.isTrue(issued instanceof IssuedProjectInvitation);
          yield* getCurrentProjectAccess(
            actor,
            yield* Schema.decodeUnknown(GetCurrentProjectAccessInput)({ projectId }),
          );
          yield* listProjectInvitations(
            actor,
            yield* Schema.decodeUnknown(ListProjectInvitationsInput)({
              projectId,
              cursor: null,
              limit: 20,
            }),
          );
          yield* inspectProjectInvitation(
            email,
            yield* Schema.decodeUnknown(InspectProjectInvitationInput)({ token }),
          );
          yield* acceptProjectInvitation(
            actor,
            email,
            yield* Schema.decodeUnknown(AcceptProjectInvitationInput)({ token }),
            requestId,
          );
          yield* revokeProjectInvitation(
            actor,
            yield* Schema.decodeUnknown(RevokeProjectInvitationInput)({
              projectId,
              invitationId,
              version: 1,
            }),
            requestId,
          );
          yield* listProjectMembers(
            actor,
            yield* Schema.decodeUnknown(ListProjectMembersInput)({
              projectId,
              cursor: null,
              limit: 20,
            }),
          );
          yield* updateProjectMemberPolicy(
            actor,
            yield* Schema.decodeUnknown(UpdateProjectMemberPolicyInput)({
              projectId,
              membershipId,
              version: 1,
              role: "developer",
              localeAccess: { mode: "none" },
            }),
            requestId,
          );
          yield* removeProjectMember(
            actor,
            yield* Schema.decodeUnknown(RemoveProjectMemberInput)({
              projectId,
              membershipId,
              version: 1,
            }),
            requestId,
          );

          assert.deepEqual(calls, [
            "createInvitation",
            "getCurrentAccess",
            "listInvitations",
            "inspectInvitation",
            "acceptInvitation",
            "revokeInvitation",
            "listMembers",
            "updateMemberPolicy",
            "removeMember",
          ]);
        }),
    );

    it.effect("rejects malformed actors and emails before persistence", () =>
      Effect.gen(function* () {
        calls.length = 0;
        const invalidActor = yield* Effect.exit(
          getCurrentProjectAccess(
            "",
            yield* Schema.decodeUnknown(GetCurrentProjectAccessInput)({ projectId }),
          ),
        );
        const invalidEmail = yield* Effect.exit(
          inspectProjectInvitation(
            "not-an-email",
            yield* Schema.decodeUnknown(InspectProjectInvitationInput)({ token }),
          ),
        );

        assert.strictEqual(invalidActor._tag, "Failure");
        assert.strictEqual(invalidEmail._tag, "Failure");
        assert.deepEqual(calls, []);
      }),
    );
  });
});
