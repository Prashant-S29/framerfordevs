import { useId, useState } from "react";
import { Button } from "@framerfordevs/ui/components/button";

export function studioPreviewEnabled(): boolean {
  return (
    document.querySelector('meta[name="ffd-studio-preview"]')?.getAttribute("content") === "enabled"
  );
}

export interface StudioPreviewSelection {
  readonly revisionId: string | null;
  readonly label: string;
}

export function studioPreviewLaunchPath(input: {
  readonly mountPath: string;
  readonly collectionId: string;
  readonly locale: string;
  readonly entryId: string;
  readonly revisionId: string | null;
}): string {
  const parameters = new URLSearchParams({
    collection: input.collectionId,
    locale: input.locale,
    entry: input.entryId,
  });
  if (input.revisionId !== null) parameters.set("revision", input.revisionId);
  return `${input.mountPath}/preview/launch?${parameters.toString()}`;
}

export function StudioPreviewPanel(props: {
  readonly mountPath: string;
  readonly collectionId: string;
  readonly locale: string;
  readonly entryId: string;
  readonly entryName: string;
  readonly open: boolean;
  readonly selection: StudioPreviewSelection;
  readonly savedVersion: string;
  readonly onOpenChange: (open: boolean) => void;
  readonly onShowCurrent: () => void;
}) {
  const regionId = useId();
  const [generation, setGeneration] = useState(0);
  const [loadedVersion, setLoadedVersion] = useState(props.savedVersion);
  const current = props.selection.revisionId === null;
  const src = studioPreviewLaunchPath({ ...props, revisionId: props.selection.revisionId });
  const reload = () => {
    setLoadedVersion(props.savedVersion);
    setGeneration((value) => value + 1);
  };
  return (
    <section className="studio-panel" aria-labelledby={`${regionId}-heading`}>
      <div className="studio-inline-actions">
        <h3 id={`${regionId}-heading`}>Preview</h3>
        <Button
          type="button"
          variant="outline"
          aria-expanded={props.open}
          aria-controls={`${regionId}-region`}
          onClick={() => {
            if (!props.open) reload();
            props.onOpenChange(!props.open);
          }}
        >
          {props.open ? "Hide preview" : "Show preview"}
        </Button>
      </div>
      {props.open ? (
        <div id={`${regionId}-region`} className="studio-stack">
          <p className="studio-muted">
            {current
              ? "Preview shows the last saved draft. Unsaved changes do not appear."
              : `Preview shows ${props.selection.label}.`}
          </p>
          {current && loadedVersion !== props.savedVersion ? (
            <p role="status">The draft changed after this preview loaded. Reload the preview.</p>
          ) : null}
          <div className="studio-inline-actions">
            <Button type="button" variant="outline" onClick={reload}>
              Reload preview
            </Button>
            {current ? null : (
              <Button type="button" variant="outline" onClick={props.onShowCurrent}>
                Preview the current draft
              </Button>
            )}
          </div>
          <iframe
            key={`${src}#${generation}`}
            className="studio-preview-frame"
            title={`Preview of ${props.entryName}`}
            src={src}
            sandbox="allow-scripts allow-same-origin allow-forms"
            referrerPolicy="no-referrer"
            allow=""
          />
        </div>
      ) : null}
    </section>
  );
}
