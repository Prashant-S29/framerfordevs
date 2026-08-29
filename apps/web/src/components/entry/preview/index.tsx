// Renders credential-free dashboard Preview controls, exact source authority, and renderer-neutral JSON.

import { Alert, AlertDescription, AlertTitle } from "@framerfordevs/ui/components/alert";
import { Badge } from "@framerfordevs/ui/components/badge";
import { Button, buttonVariants } from "@framerfordevs/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@framerfordevs/ui/components/card";
import { Field, FieldDescription, FieldLabel } from "@framerfordevs/ui/components/field";
import { NativeSelect, NativeSelectOption } from "@framerfordevs/ui/components/native-select";
import { Skeleton } from "@framerfordevs/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon, ClipboardIcon, Code2Icon, ExternalLinkIcon } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

export interface EntryPreviewSearch {
  readonly locale: string;
  readonly source: "current" | "revision";
  readonly schemaRevisionId?: string;
  readonly sharedRevision?: string;
  readonly localizedRevision?: string;
}

export function isValidRevisionPreviewSearch(search: EntryPreviewSearch): boolean {
  return (
    search.source === "revision" &&
    search.schemaRevisionId !== undefined &&
    search.sharedRevision !== undefined &&
    search.localizedRevision !== undefined
  );
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

function revisionLabel(item: {
  readonly id: string;
  readonly sequence: number;
  readonly schemaRevisionId: string;
}) {
  return `Revision ${item.sequence} · ${item.id.slice(0, 8)} · schema ${item.schemaRevisionId.slice(0, 8)}`;
}

export function EntryPreview({
  projectId,
  collectionId,
  entryId,
  search,
  onSearchChange,
}: {
  readonly projectId: string;
  readonly collectionId: string;
  readonly entryId: string;
  readonly search: EntryPreviewSearch;
  readonly onSearchChange: (search: EntryPreviewSearch) => void;
}) {
  const project = useQuery(orpc.platform.projects.get.queryOptions({ input: { projectId } }));
  const locales = useQuery(
    orpc.platform.projects.locales.list.queryOptions({
      input: { projectId, view: "enabled", includeRemoved: false },
    }),
  );
  const environmentId = project.data?.data.environment.id ?? "";
  const scope = { projectId, environmentId, collectionId, entryId, locale: search.locale };
  const collection = useQuery({
    ...orpc.platform.projects.collections.get.queryOptions({
      input: { projectId, environmentId, collectionId },
    }),
    enabled: Boolean(environmentId),
  });
  const sharedHistory = useQuery({
    ...orpc.platform.projects.collections.entries.listRevisions.queryOptions({
      input: { ...scope, scope: "shared", cursor: null, limit: 25 },
    }),
    enabled: Boolean(environmentId && search.locale),
  });
  const localizedHistory = useQuery({
    ...orpc.platform.projects.collections.entries.listRevisions.queryOptions({
      input: { ...scope, scope: "localized", cursor: null, limit: 25 },
    }),
    enabled: Boolean(environmentId && search.locale),
  });
  const publication = useQuery({
    ...orpc.platform.projects.collections.entries.publications.status.queryOptions({
      input: scope,
    }),
    enabled: Boolean(environmentId && search.locale),
    retry: false,
  });
  const currentPreview = useQuery({
    ...orpc.platform.projects.collections.entries.preview.current.queryOptions({ input: scope }),
    enabled: Boolean(environmentId && search.locale && search.source === "current"),
    retry: false,
  });
  const revisionSelectionValid = isValidRevisionPreviewSearch(search);
  const revisionPreview = useQuery({
    ...orpc.platform.projects.collections.entries.preview.revision.queryOptions({
      input: {
        ...scope,
        schemaRevisionId: search.schemaRevisionId ?? "",
        sharedRevisionId: search.sharedRevision === "none" ? null : (search.sharedRevision ?? null),
        localizedRevisionId:
          search.localizedRevision === "none" ? null : (search.localizedRevision ?? null),
      },
    }),
    enabled: Boolean(environmentId && search.locale && revisionSelectionValid),
    retry: false,
  });
  const preview = search.source === "current" ? currentPreview : revisionPreview;
  const sharedItems = useMemo(() => sharedHistory.data?.data.items ?? [], [sharedHistory.data]);
  const localizedItems = useMemo(
    () => localizedHistory.data?.data.items ?? [],
    [localizedHistory.data],
  );
  const schemaIds = useMemo(
    () =>
      [
        ...new Set([
          ...sharedItems.map((item) => item.schemaRevisionId),
          ...localizedItems.map((item) => item.schemaRevisionId),
          ...(search.schemaRevisionId === undefined ? [] : [search.schemaRevisionId]),
        ]),
      ].sort(),
    [localizedItems, search.schemaRevisionId, sharedItems],
  );
  const selectedSchemaId = search.schemaRevisionId;
  const compatibleShared = sharedItems.filter((item) => item.schemaRevisionId === selectedSchemaId);
  const compatibleLocalized = localizedItems.filter(
    (item) => item.schemaRevisionId === selectedSchemaId,
  );
  const localeItems = locales.data?.data.items ?? [];
  const exactLocaleAvailable = localeItems.some((locale) => locale.tag === search.locale);
  const previewItem = preview.data?.data;
  const projectValue = project.data?.data;
  const collectionValue = collection.data?.data;
  const endpoint =
    projectValue && collectionValue && search.locale
      ? search.source === "current"
        ? `/api/preview/v1/projects/${projectId}/environments/${projectValue.environment.key}/collections/${collectionValue.apiKey}/entries/${entryId}/draft?locale=${encodeURIComponent(search.locale)}`
        : revisionSelectionValid
          ? `/api/preview/v1/projects/${projectId}/environments/${projectValue.environment.key}/collections/${collectionValue.apiKey}/entries/${entryId}/revisions/${search.schemaRevisionId}?locale=${encodeURIComponent(search.locale)}&sharedRevision=${encodeURIComponent(search.sharedRevision ?? "")}&localizedRevision=${encodeURIComponent(search.localizedRevision ?? "")}`
          : ""
      : "";

  const selectRevisionSource = () => {
    const schemaRevisionId = schemaIds[0];
    onSearchChange({
      locale: search.locale,
      source: "revision",
      ...(schemaRevisionId === undefined ? {} : { schemaRevisionId }),
      sharedRevision: "none",
      localizedRevision: "none",
    });
  };

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-4">
        <Link
          className={buttonVariants({ variant: "ghost", className: "self-start" })}
          to="/projects/$projectId/collections/$collectionId/entries/$entryId"
          params={{ projectId, collectionId, entryId }}
          search={{ locale: search.locale }}
        >
          <ArrowLeftIcon data-icon="inline-start" /> Back to editor
        </Link>
        <div className="min-w-0">
          <p className="text-muted-foreground font-mono text-xs break-all" translate="no">
            {entryId}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Entry preview</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Inspect the exact renderer-neutral JSON available to an authorized integration.
          </p>
        </div>
      </header>

      <Alert>
        <Code2Icon aria-hidden="true" />
        <AlertTitle>Unpublished draft preview</AlertTitle>
        <AlertDescription>
          Preview reads persisted draft values only. Production Delivery and publication state are
          unchanged.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Preview source</CardTitle>
          <CardDescription>
            Locale and source selection are explicit and URL-authoritative. No fallback is used.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="preview-locale">Locale</FieldLabel>
            <NativeSelect
              id="preview-locale"
              value={search.locale}
              onChange={(event) =>
                onSearchChange({ locale: event.target.value, source: "current" })
              }
            >
              {localeItems.map((locale) => (
                <NativeSelectOption key={locale.id} value={locale.tag}>
                  {locale.displayName} ({locale.tag})
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldDescription>The exact enabled locale to preview.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="preview-source">Source</FieldLabel>
            <NativeSelect
              id="preview-source"
              value={search.source}
              onChange={(event) => {
                if (event.target.value === "revision") selectRevisionSource();
                else onSearchChange({ locale: search.locale, source: "current" });
              }}
            >
              <NativeSelectOption value="current">Current persisted draft</NativeSelectOption>
              <NativeSelectOption value="revision">Explicit revision sources</NativeSelectOption>
            </NativeSelect>
            <FieldDescription>Historical sources are never inferred by time.</FieldDescription>
          </Field>
          {search.source === "revision" ? (
            <>
              <Field>
                <FieldLabel htmlFor="preview-schema">Schema revision</FieldLabel>
                <NativeSelect
                  id="preview-schema"
                  value={search.schemaRevisionId ?? ""}
                  onChange={(event) =>
                    onSearchChange({
                      locale: search.locale,
                      source: "revision",
                      schemaRevisionId: event.target.value,
                      sharedRevision: "none",
                      localizedRevision: "none",
                    })
                  }
                >
                  <NativeSelectOption value="">Select a schema revision</NativeSelectOption>
                  {schemaIds.map((schemaId) => (
                    <NativeSelectOption key={schemaId} value={schemaId}>
                      {schemaId}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="preview-shared-revision">Shared source</FieldLabel>
                <NativeSelect
                  id="preview-shared-revision"
                  value={search.sharedRevision ?? ""}
                  disabled={!selectedSchemaId}
                  onChange={(event) =>
                    onSearchChange({
                      ...search,
                      source: "revision",
                      sharedRevision: event.target.value,
                    })
                  }
                >
                  <NativeSelectOption value="none">None · version 0</NativeSelectOption>
                  {search.sharedRevision !== undefined &&
                  search.sharedRevision !== "none" &&
                  !compatibleShared.some((item) => item.id === search.sharedRevision) ? (
                    <NativeSelectOption value={search.sharedRevision}>
                      Selected revision · {search.sharedRevision}
                    </NativeSelectOption>
                  ) : null}
                  {compatibleShared.map((item) => (
                    <NativeSelectOption key={item.id} value={item.id}>
                      {revisionLabel(item)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="preview-localized-revision">Localized source</FieldLabel>
                <NativeSelect
                  id="preview-localized-revision"
                  value={search.localizedRevision ?? ""}
                  disabled={!selectedSchemaId}
                  onChange={(event) =>
                    onSearchChange({
                      ...search,
                      source: "revision",
                      localizedRevision: event.target.value,
                    })
                  }
                >
                  <NativeSelectOption value="none">None · version 0</NativeSelectOption>
                  {search.localizedRevision !== undefined &&
                  search.localizedRevision !== "none" &&
                  !compatibleLocalized.some((item) => item.id === search.localizedRevision) ? (
                    <NativeSelectOption value={search.localizedRevision}>
                      Selected revision · {search.localizedRevision}
                    </NativeSelectOption>
                  ) : null}
                  {compatibleLocalized.map((item) => (
                    <NativeSelectOption key={item.id} value={item.id}>
                      {revisionLabel(item)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            </>
          ) : null}
        </CardContent>
      </Card>

      {!search.locale || !exactLocaleAvailable ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Exact locale unavailable</AlertTitle>
          <AlertDescription>
            Choose an enabled project locale. Preview will not substitute another locale.
          </AlertDescription>
        </Alert>
      ) : search.source === "revision" && !revisionSelectionValid ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Historical selection is incomplete or invalid</AlertTitle>
          <AlertDescription>
            Select one schema and explicit shared and localized sources. No Preview request was
            issued.
            <Button
              className="mt-3 block"
              variant="outline"
              onClick={() => onSearchChange({ locale: search.locale, source: "current" })}
            >
              Preview current draft
            </Button>
          </AlertDescription>
        </Alert>
      ) : preview.isPending ? (
        <Card aria-label="Loading Preview">
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </CardHeader>
          <CardContent className="space-y-2" aria-live="polite">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-40 w-full" />
            <span className="sr-only">Loading Preview…</span>
          </CardContent>
        </Card>
      ) : preview.isError || !previewItem ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Preview could not be loaded</AlertTitle>
          <AlertDescription>
            {errorCode(preview.error) === "PREVIEW_REVISION_INCOMPATIBLE"
              ? "The selected revisions do not share this schema contract. Choose compatible sources."
              : errorCode(preview.error) === "PREVIEW_RESPONSE_TOO_LARGE"
                ? "The exact Preview response exceeds 2.5 MiB and was not truncated."
                : errorCode(preview.error) === "FORBIDDEN"
                  ? "Your project or locale access does not allow this Preview."
                  : "Retry the request or choose another explicit source."}
            <Button className="mt-3 block" variant="outline" onClick={() => void preview.refetch()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>Selected authority</CardTitle>
                  <CardDescription>
                    Stable source identities returned by the server transaction.
                  </CardDescription>
                </div>
                <Badge variant="outline">
                  {previewItem.preview.source === "current" ? "Current draft" : "Revision sources"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">
              {[
                ["Locale", previewItem.locale],
                ["Schema", previewItem.preview.schemaRevisionId],
                [
                  "Shared",
                  previewItem.preview.sharedRevisionId
                    ? `${previewItem.preview.sharedRevisionId} · v${previewItem.preview.sharedVersion}`
                    : "none · v0",
                ],
                [
                  "Localized",
                  previewItem.preview.localizedRevisionId
                    ? `${previewItem.preview.localizedRevisionId} · v${previewItem.preview.localizedVersion}`
                    : "none · v0",
                ],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0 rounded-md border p-3">
                  <p className="text-muted-foreground text-xs">{label}</p>
                  <p className="mt-1 font-mono break-all" translate="no">
                    {value}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>Validation</CardTitle>
                  <CardDescription>
                    Publishability feedback does not change Preview success.
                  </CardDescription>
                </div>
                <Badge variant={previewItem.validation.valid ? "default" : "destructive"}>
                  {previewItem.validation.valid ? "Valid" : "Needs attention"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent aria-live="polite">
              {previewItem.validation.issues.length === 0 ? (
                <p className="text-sm">No validation issues were reported.</p>
              ) : (
                <ul className="list-disc space-y-2 pl-5 text-sm">
                  {previewItem.validation.issues.map((issue, index) => (
                    <li key={`${issue.code}-${issue.path}-${index}`}>
                      <span className="font-medium">{issue.message}</span>{" "}
                      <span className="text-muted-foreground font-mono break-all" translate="no">
                        {issue.path} · {issue.code}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {previewItem.validation.capped ? (
                <p className="text-muted-foreground mt-3 text-sm">
                  Validation feedback reached the 50-issue limit.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Preview JSON</CardTitle>
              <CardDescription>
                Rich text remains structured data. No HTML is generated and external assets are not
                loaded.
              </CardDescription>
            </CardHeader>
            <CardContent className="min-w-0">
              {Object.keys(previewItem.data).length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  This source projects no visible fields for your dashboard role.
                </p>
              ) : (
                <pre
                  className="max-h-[36rem] overflow-auto rounded-md border bg-muted p-4 text-xs whitespace-pre-wrap break-words"
                  translate="no"
                >
                  {JSON.stringify(previewItem.data, null, 2)}
                </pre>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Production separation</CardTitle>
          <CardDescription>Delivery status is loaded independently from Preview.</CardDescription>
        </CardHeader>
        <CardContent>
          {publication.isPending ? (
            <p role="status">Loading publication status…</p>
          ) : publication.data?.data.currentPublication ? (
            <p>
              Published as sequence {publication.data.data.currentPublication.sequence} for{" "}
              <span className="font-mono" translate="no">
                {search.locale}
              </span>
              .
            </p>
          ) : (
            <p>
              <span className="font-mono" translate="no">
                {search.locale || "This locale"}
              </span>{" "}
              is unavailable in current Delivery. Preview does not change that state.
            </p>
          )}
        </CardContent>
      </Card>

      {endpoint ? (
        <Card>
          <CardHeader>
            <CardTitle>Public Preview endpoint</CardTitle>
            <CardDescription>
              This URL contains source authority only. Send a compliant Preview credential in the
              Authorization header; never add it to the URL or a public browser bundle.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex min-w-0 flex-col gap-3">
            <code className="rounded-md border bg-muted p-3 text-xs break-all" translate="no">
              {endpoint}
            </code>
            <Button
              className="self-start"
              variant="outline"
              onClick={() => {
                void navigator.clipboard
                  .writeText(endpoint)
                  .then(() => toast.success("Credential-free Preview endpoint copied."))
                  .catch(() => toast.error("The endpoint could not be copied."));
              }}
            >
              <ClipboardIcon data-icon="inline-start" /> Copy endpoint
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <p className="text-muted-foreground flex items-center gap-2 text-xs">
        <ExternalLinkIcon aria-hidden="true" className="size-3" /> Preview credentials can read all
        current and historical draft fields in their environment, including editor-hidden fields.
      </p>
    </div>
  );
}
