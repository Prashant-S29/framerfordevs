import { ControlPlanePutStudioRegistrationRequest } from "@framerfordevs/api/contracts/control-plane/index";
import type { Project } from "@framerfordevs/api/contracts/platform/index";
import { Alert, AlertDescription, AlertTitle } from "@framerfordevs/ui/components/alert";
import { Button } from "@framerfordevs/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@framerfordevs/ui/components/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@framerfordevs/ui/components/field";
import { Input } from "@framerfordevs/ui/components/input";
import { Spinner } from "@framerfordevs/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Option, Schema } from "effect";
import { ExternalLinkIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

function applicationErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("data" in error) return applicationErrorCode(error.data);
  if ("error" in error) return applicationErrorCode(error.error);
  return undefined;
}

interface PendingCommand {
  readonly intent: string;
  readonly commandId: string;
}

export function StudioRegistrationSettings({
  project,
  canWrite,
}: {
  readonly project: Project;
  readonly canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const [applicationOrigin, setApplicationOrigin] = useState("");
  const [mountPath, setMountPath] = useState("/studio");
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const pendingCommand = useRef<PendingCommand | null>(null);
  const scope = { projectId: project.id, environmentId: project.environment.id };
  const registrationQuery = useQuery({
    ...orpc.platform.projects.studioRegistration.get.queryOptions({ input: scope }),
    meta: { suppressGlobalErrorToast: true },
    retry: false,
  });
  const registration = registrationQuery.data?.data ?? null;
  const isMissing = applicationErrorCode(registrationQuery.error) === "NOT_FOUND";

  useEffect(() => {
    if (!registration) return;
    setApplicationOrigin(registration.applicationOrigin);
    setMountPath(registration.mountPath);
  }, [registration]);

  const putRegistration = useMutation(
    orpc.platform.projects.studioRegistration.put.mutationOptions({
      onSuccess: async (response) => {
        pendingCommand.current = null;
        setValidationMessage(null);
        await queryClient.invalidateQueries({
          queryKey: orpc.platform.projects.key(),
        });
        toast.success(response.message);
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const save = () => {
    const intent = JSON.stringify([registration?.version ?? null, applicationOrigin, mountPath]);
    if (pendingCommand.current?.intent !== intent) {
      pendingCommand.current = { intent, commandId: crypto.randomUUID() };
    }
    const decoded = Option.getOrUndefined(
      Schema.decodeUnknownOption(ControlPlanePutStudioRegistrationRequest)({
        commandId: pendingCommand.current.commandId,
        expectedVersion: registration?.version ?? null,
        applicationOrigin,
        mountPath,
      }),
    );
    if (!decoded) {
      setValidationMessage(
        "Use a canonical HTTPS origin (or explicit loopback HTTP origin) and a non-root absolute mount path.",
      );
      return;
    }
    setValidationMessage(null);
    putRegistration.mutate({ ...scope, ...decoded });
  };

  const unavailableError = registrationQuery.error && !isMissing;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>Studio registration</CardTitle>
            <CardDescription>
              Inert application metadata for this exact environment. It grants no session, redirect,
              or browser credential authority.
            </CardDescription>
          </div>
          <ExternalLinkIcon aria-hidden="true" />
        </div>
      </CardHeader>
      <CardContent>
        {registrationQuery.isPending ? (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Spinner /> Loading Studio registration…
          </div>
        ) : unavailableError ? (
          <Alert variant="destructive">
            <AlertTitle>Studio registration unavailable</AlertTitle>
            <AlertDescription>{registrationQuery.error.message}</AlertDescription>
          </Alert>
        ) : (
          <FieldGroup>
            <Field data-invalid={Boolean(validationMessage)}>
              <FieldLabel htmlFor="studio-application-origin">Application origin</FieldLabel>
              <Input
                id="studio-application-origin"
                type="url"
                maxLength={2048}
                placeholder="https://studio.example.com"
                value={applicationOrigin}
                disabled={!canWrite || project.archivedAt !== null}
                onChange={(event) => setApplicationOrigin(event.target.value)}
                autoComplete="url"
                aria-invalid={Boolean(validationMessage)}
              />
            </Field>
            <Field data-invalid={Boolean(validationMessage)}>
              <FieldLabel htmlFor="studio-mount-path">Mount path</FieldLabel>
              <Input
                id="studio-mount-path"
                maxLength={240}
                placeholder="/studio"
                value={mountPath}
                disabled={!canWrite || project.archivedAt !== null}
                onChange={(event) => setMountPath(event.target.value)}
                autoComplete="off"
                aria-invalid={Boolean(validationMessage)}
              />
              <FieldError>{validationMessage}</FieldError>
            </Field>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-muted-foreground text-xs">
                {registration
                  ? `Registered version ${registration.version}.`
                  : "No Studio application is registered."}
              </p>
              {canWrite && project.archivedAt === null ? (
                <Button type="button" disabled={putRegistration.isPending} onClick={save}>
                  {putRegistration.isPending ? <Spinner data-icon="inline-start" /> : null}
                  {putRegistration.isPending
                    ? "Saving…"
                    : registration
                      ? "Save registration"
                      : "Register Studio"}
                </Button>
              ) : null}
            </div>
          </FieldGroup>
        )}
      </CardContent>
    </Card>
  );
}
