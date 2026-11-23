import { AlertTriangle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@framerfordevs/ui/components/alert";

import { decodeStudioLocalEditorStatus } from "../contracts";

const maximumStatusBytes = 1_024;

async function loadLocalEditorStatus(mountPath: string) {
  const response = await fetch(`${mountPath}/api/editor/status`, {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  const text = await response.text();
  if (!response.ok || text.length > maximumStatusBytes) {
    throw new Error("STUDIO_LOCAL_EDITOR_STATUS_UNAVAILABLE");
  }
  return decodeStudioLocalEditorStatus(JSON.parse(text));
}

export function LocalEditorSchemaNotice({ mountPath }: { readonly mountPath: string }) {
  const status = useQuery({
    queryKey: ["studio", "local-editor-status"],
    queryFn: () => loadLocalEditorStatus(mountPath),
    refetchInterval: 5_000,
    retry: false,
  });
  if (status.data === undefined || status.data.schema === "matches") return null;
  return (
    <Alert className="studio-alert" role="status">
      <AlertTriangle aria-hidden="true" />
      <h2 className="studio-alert-title">
        {status.data.schema === "invalid"
          ? "The local schema is invalid"
          : "The local schema differs from the hosted schema"}
      </h2>
      <AlertDescription>
        {status.data.schema === "invalid"
          ? `Fix the schema source (${status.data.diagnosticCode ?? "CLI_SCHEMA_INVALID"}). Saving and publishing are paused.`
          : "Saving and publishing are paused. Run ffd schema plan, then ffd schema push."}
      </AlertDescription>
    </Alert>
  );
}
