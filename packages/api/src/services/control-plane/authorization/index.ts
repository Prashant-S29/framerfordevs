import type { ProjectPermissionAction } from "../../../contracts/access";
import type {
  ControlPlaneActor,
  ControlPlaneProjectAction,
} from "../../../contracts/control-plane";
import {
  authorizeProjectActor,
  type ApplicationExecutor,
  type UserProjectAuthorization,
} from "../../project-access";

const projectPolicyAction = {
  "project.read": "project.read",
  "project.update": "project.update",
  "project.archive": "project.archive",
  "project.restore": "project.restore",
  "project.capability.manage": "project.capability.manage",
  "studio_registration.read": "project.read",
  "studio_registration.write": "project.update",
} satisfies Readonly<Record<ControlPlaneProjectAction, ProjectPermissionAction>>;

export function controlPlaneProjectPolicyAction(
  action: ControlPlaneProjectAction,
): ProjectPermissionAction {
  return projectPolicyAction[action];
}

export function authorizeControlPlaneProject(
  executor: ApplicationExecutor,
  actor: ControlPlaneActor,
  projectId: string,
  action: ControlPlaneProjectAction,
  environmentId: string | null = null,
): Promise<UserProjectAuthorization> {
  return authorizeProjectActor(
    executor,
    actor,
    projectId,
    controlPlaneProjectPolicyAction(action),
    null,
    {
      targetEnvironmentId: environmentId,
      requirePrimaryCredentialEnvironment: true,
    },
  );
}
