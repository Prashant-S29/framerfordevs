import type { CanonicalEmail, ProjectRole } from "../../../contracts/access";
import type {
  PreviewTargetUrl,
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
  StudioLocalEditorHost,
  StudioMountedHost,
  StudioProjectIdentity,
  StudioRegistrationAuthority,
  StudioSessionAuthority,
  StudioUserIdentity,
} from "../../../contracts/studio";
import { projectStudioActions } from "../authority";

export type StudioBootstrapHostInput =
  | Readonly<{
      kind: "mounted";
      registration: Readonly<{
        id: StudioRegistrationId;
        version: ResourceVersion;
        applicationOrigin: StudioApplicationOrigin;
        mountPath: StudioMountPath;
      }>;
    }>
  | Readonly<{ kind: "local_editor"; previewUrl: PreviewTargetUrl | null }>;

export interface StudioBootstrapInput {
  readonly host: StudioBootstrapHostInput;
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
    host:
      input.host.kind === "mounted"
        ? StudioMountedHost.make({
            kind: "mounted",
            registration: StudioRegistrationAuthority.make({ ...input.host.registration }),
          })
        : StudioLocalEditorHost.make({ kind: "local_editor", previewUrl: input.host.previewUrl }),
    project: StudioProjectIdentity.make({ ...input.project }),
    environment: StudioEnvironmentIdentity.make({ ...input.environment }),
    user: StudioUserIdentity.make({ ...input.user }),
    role: input.role,
    effectiveActions: projectStudioActions(input.role),
    session: StudioSessionAuthority.make({ expiresAt: input.expiresAt }),
  });
}
