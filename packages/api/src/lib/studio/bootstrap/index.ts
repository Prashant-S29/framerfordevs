// Builds the bounded current-user Studio bootstrap projection from authorized current state.

import type { CanonicalEmail, ProjectRole } from "../../../contracts/access";
import type {
  StudioApplicationOrigin,
  StudioMountPath,
  StudioRegistrationId,
} from "../../../contracts/control-plane";
import type {
  AuthUserId,
  EnvironmentId,
  IsoDateTime,
  ProjectId,
  ProjectName,
  ResourceVersion,
  WorkspaceId,
} from "../../../contracts/platform";
import {
  StudioBootstrap,
  StudioEnvironmentIdentity,
  StudioProjectIdentity,
  StudioRegistrationAuthority,
  StudioSessionAuthority,
  StudioUserIdentity,
} from "../../../contracts/studio";
import { projectStudioActions } from "../authority";

export interface StudioBootstrapInput {
  readonly registration: Readonly<{
    id: StudioRegistrationId;
    version: ResourceVersion;
    applicationOrigin: StudioApplicationOrigin;
    mountPath: StudioMountPath;
  }>;
  readonly project: Readonly<{
    id: ProjectId;
    name: ProjectName;
    workspaceId: WorkspaceId;
  }>;
  readonly environment: Readonly<{
    id: EnvironmentId;
    key: "main";
    name: "main";
  }>;
  readonly user: Readonly<{
    id: AuthUserId;
    name: string;
    email: CanonicalEmail;
  }>;
  readonly role: ProjectRole;
  readonly expiresAt: IsoDateTime;
}

export function buildStudioBootstrap(input: StudioBootstrapInput) {
  return StudioBootstrap.make({
    formatVersion: 1,
    registration: StudioRegistrationAuthority.make({ ...input.registration }),
    project: StudioProjectIdentity.make({ ...input.project }),
    environment: StudioEnvironmentIdentity.make({ ...input.environment }),
    user: StudioUserIdentity.make({ ...input.user }),
    role: input.role,
    effectiveActions: projectStudioActions(input.role),
    session: StudioSessionAuthority.make({ expiresAt: input.expiresAt }),
  });
}
