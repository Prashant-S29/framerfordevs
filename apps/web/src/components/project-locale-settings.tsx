import { canonicalizeLocaleTag } from "@framerfordevs/api/contracts/locale-tag";
import type { ProjectLocale } from "@framerfordevs/api/contracts/locales";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@framerfordevs/ui/components/alert-dialog";
import { Badge } from "@framerfordevs/ui/components/badge";
import { Button } from "@framerfordevs/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@framerfordevs/ui/components/card";
import { Checkbox } from "@framerfordevs/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@framerfordevs/ui/components/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@framerfordevs/ui/components/field";
import { Input } from "@framerfordevs/ui/components/input";
import { Spinner } from "@framerfordevs/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  LanguagesIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { LocaleTabs } from "@/components/locale-tabs";
import { localeFormSchema } from "@/lib/platform-validation";
import { orpc } from "@/utils/orpc";

interface ProjectLocaleSettingsProps {
  readonly projectId: string;
  readonly canManage: boolean;
  readonly isArchived: boolean;
}

interface PendingTransition {
  readonly locale: ProjectLocale;
  readonly status: "disabled" | "removed";
  readonly dependencyMessage: string | null;
}

function applicationErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("data" in error) return applicationErrorCode(error.data);
  if ("error" in error) return applicationErrorCode(error.error);
  return undefined;
}

function suggestedDisplayName(tag: string): string | undefined {
  const canonical = canonicalizeLocaleTag(tag);
  const language = canonical?.split("-")[0];
  if (!language) return undefined;
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(language);
  } catch {
    return undefined;
  }
}

export function ProjectLocaleSettings({
  projectId,
  canManage,
  isArchived,
}: ProjectLocaleSettingsProps) {
  const [includeRemoved, setIncludeRemoved] = useState(false);
  const [selectedLocaleId, setSelectedLocaleId] = useState("");
  const locales = useQuery(
    orpc.platform.projects.locales.list.queryOptions({
      input: {
        projectId,
        view: canManage ? "settings" : "enabled",
        includeRemoved: canManage && includeRemoved,
      },
    }),
  );
  const items = locales.data?.data.items ?? [];
  const enabledLocales = items.filter((locale) => locale.status === "enabled");

  useEffect(() => {
    if (selectedLocaleId === "" && enabledLocales[0]) {
      setSelectedLocaleId(enabledLocales[0].id);
    }
  }, [enabledLocales, selectedLocaleId]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Project locales</CardTitle>
            <CardDescription>
              Every content request selects one exact enabled locale. English is always available.
            </CardDescription>
          </div>
          <LanguagesIcon aria-hidden="true" />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {locales.isPending ? (
          <div
            className="flex items-center gap-2"
            role="status"
            aria-label="Loading project locales"
          >
            <Spinner />
            <span className="text-muted-foreground text-sm">Loading locales…</span>
          </div>
        ) : null}
        {locales.isError ? (
          <div
            className="flex flex-col items-start gap-2 border border-destructive/40 p-3"
            role="alert"
          >
            <p className="text-sm font-medium">Project locales could not be loaded.</p>
            <Button size="sm" variant="outline" onClick={() => void locales.refetch()}>
              Try again
            </Button>
          </div>
        ) : null}
        {!locales.isPending && !locales.isError && items.length === 0 ? (
          <p className="text-muted-foreground text-sm">No permitted locales are available.</p>
        ) : null}
        {canManage && !locales.isPending && !locales.isError ? (
          <LocaleManager
            projectId={projectId}
            locales={items}
            includeRemoved={includeRemoved}
            setIncludeRemoved={setIncludeRemoved}
            disabled={isArchived}
          />
        ) : null}
        {enabledLocales.length > 0 ? (
          <div className="flex flex-col gap-3">
            <div>
              <h3 className="font-medium text-sm">Locale tabs foundation</h3>
              <p className="text-muted-foreground text-sm">
                Keyboard navigation and stable locale identity are ready for localized forms.
              </p>
            </div>
            <LocaleTabs
              locales={enabledLocales}
              selectedLocaleId={selectedLocaleId}
              onSelectedLocaleChange={setSelectedLocaleId}
              hasUnsavedChanges={false}
              renderContent={(locale) => (
                <div className="border bg-muted/40 p-4">
                  <p className="font-medium text-sm">{locale.displayName} editing context</p>
                  <p className="mt-1 text-muted-foreground text-sm">
                    Localized fields arrive with the entry editor. Requests will use the exact
                    <span className="mx-1 font-mono" translate="no">
                      {locale.tag}
                    </span>
                    locale without fallback.
                  </p>
                </div>
              )}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function LocaleManager({
  projectId,
  locales,
  includeRemoved,
  setIncludeRemoved,
  disabled,
}: {
  readonly projectId: string;
  readonly locales: ReadonlyArray<ProjectLocale>;
  readonly includeRemoved: boolean;
  readonly setIncludeRemoved: (value: boolean) => void;
  readonly disabled: boolean;
}) {
  const queryClient = useQueryClient();
  const [pendingTransition, setPendingTransition] = useState<PendingTransition | null>(null);
  const activeLocales = locales.filter((locale) => locale.status !== "removed");
  const removedLocales = locales.filter((locale) => locale.status === "removed");
  const invalidateLocales = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: orpc.platform.projects.locales.key(),
      }),
      queryClient.invalidateQueries({
        queryKey: orpc.platform.projects.members.key(),
      }),
    ]);
  const reorder = useMutation(
    orpc.platform.projects.locales.reorder.mutationOptions({
      onSuccess: async (response) => {
        await invalidateLocales();
        toast.success(response.message);
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const updateStatus = useMutation(
    orpc.platform.projects.locales.updateStatus.mutationOptions({
      onSuccess: async (response) => {
        setPendingTransition(null);
        await invalidateLocales();
        toast.success(response.message);
      },
      onError: (error) => {
        if (applicationErrorCode(error) === "LOCALE_DEPENDENCIES_EXIST") {
          setPendingTransition((current) =>
            current ? { ...current, dependencyMessage: error.message } : null,
          );
          return;
        }
        toast.error(error.message);
      },
    }),
  );

  function moveLocale(index: number, offset: -1 | 1) {
    const target = index + offset;
    if (!activeLocales[index] || !activeLocales[target]) return;
    const ordered = [...activeLocales];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    reorder.mutate({
      projectId,
      locales: ordered.map((locale) => ({
        localeId: locale.id,
        version: locale.version,
      })),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-medium text-sm">Locale configuration</h3>
          <p className="text-muted-foreground text-sm">
            Tags and stable IDs are immutable. Disabled and removed locales never resolve for
            content requests.
          </p>
        </div>
        {!disabled ? <AddLocaleDialog projectId={projectId} /> : null}
      </div>

      <div className="flex flex-col gap-3">
        {activeLocales.map((locale, index) => (
          <div
            key={locale.id}
            className="flex flex-col gap-3 border p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{locale.displayName}</p>
                <Badge variant={locale.status === "enabled" ? "default" : "secondary"}>
                  {locale.status}
                </Badge>
                {locale.tag === "en" ? <Badge variant="outline">Required</Badge> : null}
              </div>
              <p className="font-mono text-muted-foreground text-sm" translate="no">
                {locale.tag}
              </p>
            </div>
            {!disabled ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="icon-sm"
                  variant="outline"
                  aria-label={`Move ${locale.displayName} up`}
                  disabled={index === 0 || reorder.isPending}
                  onClick={() => moveLocale(index, -1)}
                >
                  <ArrowUpIcon aria-hidden="true" />
                </Button>
                <Button
                  size="icon-sm"
                  variant="outline"
                  aria-label={`Move ${locale.displayName} down`}
                  disabled={index === activeLocales.length - 1 || reorder.isPending}
                  onClick={() => moveLocale(index, 1)}
                >
                  <ArrowDownIcon aria-hidden="true" />
                </Button>
                <EditLocaleDialog locale={locale} />
                {locale.tag !== "en" ? (
                  <>
                    {locale.status === "enabled" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setPendingTransition({
                            locale,
                            status: "disabled",
                            dependencyMessage: null,
                          })
                        }
                      >
                        Disable
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={updateStatus.isPending}
                        onClick={() =>
                          updateStatus.mutate({
                            localeId: locale.id,
                            version: locale.version,
                            status: "enabled",
                            confirmDraftImpact: false,
                          })
                        }
                      >
                        Enable
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() =>
                        setPendingTransition({
                          locale,
                          status: "removed",
                          dependencyMessage: null,
                        })
                      }
                    >
                      Remove
                    </Button>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <Field orientation="horizontal">
        <Checkbox
          id="include-removed-locales"
          checked={includeRemoved}
          onCheckedChange={setIncludeRemoved}
        />
        <FieldLabel htmlFor="include-removed-locales">Show removed locales</FieldLabel>
      </Field>
      {includeRemoved && removedLocales.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Removed locales</legend>
          {removedLocales.map((locale) => (
            <div
              key={locale.id}
              className="flex flex-col gap-3 border border-dashed p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium text-sm">{locale.displayName}</p>
                <p className="font-mono text-muted-foreground text-xs" translate="no">
                  {locale.tag} · removed
                </p>
              </div>
              {!disabled ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={updateStatus.isPending}
                  onClick={() =>
                    updateStatus.mutate({
                      localeId: locale.id,
                      version: locale.version,
                      status: "enabled",
                      confirmDraftImpact: false,
                    })
                  }
                >
                  <RotateCcwIcon data-icon="inline-start" />
                  Restore
                </Button>
              ) : null}
            </div>
          ))}
        </fieldset>
      ) : null}

      <AlertDialog
        open={pendingTransition !== null}
        onOpenChange={(open) => {
          if (!open && !updateStatus.isPending) setPendingTransition(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingTransition?.status === "removed" ? "Remove" : "Disable"}{" "}
              {pendingTransition?.locale.displayName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingTransition?.dependencyMessage ??
                `This locale will become unavailable to editors and content requests. Drafts and history are not deleted. Configured member grants are suspended and become effective again if the locale is ${pendingTransition?.status === "removed" ? "restored" : "re-enabled"}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updateStatus.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={pendingTransition?.status === "removed" ? "destructive" : "default"}
              disabled={updateStatus.isPending || !pendingTransition}
              onClick={(event) => {
                event.preventDefault();
                if (!pendingTransition) return;
                updateStatus.mutate({
                  localeId: pendingTransition.locale.id,
                  version: pendingTransition.locale.version,
                  status: pendingTransition.status,
                  confirmDraftImpact: pendingTransition.dependencyMessage !== null,
                });
              }}
            >
              {updateStatus.isPending ? <Spinner data-icon="inline-start" /> : null}
              {pendingTransition?.dependencyMessage ? "Confirm impact" : "Continue"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function AddLocaleDialog({ projectId }: { readonly projectId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tag, setTag] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [validationErrors, setValidationErrors] = useState<{
    readonly tag?: string;
    readonly displayName?: string;
  }>({});
  const createLocale = useMutation(
    orpc.platform.projects.locales.create.mutationOptions({
      onSuccess: async (response) => {
        setOpen(false);
        setTag("");
        setDisplayName("");
        setValidationErrors({});
        await queryClient.invalidateQueries({
          queryKey: orpc.platform.projects.locales.key(),
        });
        toast.success(response.message);
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <PlusIcon data-icon="inline-start" />
        Add locale
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add project locale</DialogTitle>
          <DialogDescription>
            Enter one registered BCP 47 locale tag. Extensions and private-use tags are not
            supported. The canonical tag cannot be changed later.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const result = localeFormSchema.safeParse({ tag, displayName });
            if (!result.success) {
              const errors = result.error.flatten().fieldErrors;
              setValidationErrors({
                tag: errors.tag?.[0],
                displayName: errors.displayName?.[0],
              });
              return;
            }
            setValidationErrors({});
            createLocale.mutate({ projectId, ...result.data });
          }}
        >
          <FieldGroup>
            <Field data-invalid={Boolean(validationErrors.tag)}>
              <FieldLabel htmlFor="locale-tag">Locale tag</FieldLabel>
              <Input
                id="locale-tag"
                name="locale-tag"
                value={tag}
                required
                maxLength={64}
                autoComplete="off"
                spellCheck={false}
                translate="no"
                aria-invalid={Boolean(validationErrors.tag)}
                onChange={(event) => {
                  setTag(event.target.value);
                  setValidationErrors((current) => ({
                    ...current,
                    tag: undefined,
                  }));
                }}
                onBlur={() => {
                  if (displayName.trim() === "") {
                    setDisplayName(suggestedDisplayName(tag) ?? "");
                  }
                }}
              />
              <FieldDescription>Examples: hi, gu, en-GB, zh-Hant-TW.</FieldDescription>
              <FieldError>{validationErrors.tag}</FieldError>
            </Field>
            <Field data-invalid={Boolean(validationErrors.displayName)}>
              <FieldLabel htmlFor="locale-display-name">Display name</FieldLabel>
              <Input
                id="locale-display-name"
                name="locale-display-name"
                value={displayName}
                required
                maxLength={100}
                autoComplete="off"
                aria-invalid={Boolean(validationErrors.displayName)}
                onChange={(event) => {
                  setDisplayName(event.target.value);
                  setValidationErrors((current) => ({
                    ...current,
                    displayName: undefined,
                  }));
                }}
              />
              <FieldDescription>
                The browser suggestion is editable and the submitted value remains explicit.
              </FieldDescription>
              <FieldError>{validationErrors.displayName}</FieldError>
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createLocale.isPending || tag.trim() === "" || displayName.trim() === ""}
              >
                {createLocale.isPending ? <Spinner data-icon="inline-start" /> : null}
                Add locale
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditLocaleDialog({ locale }: { readonly locale: ProjectLocale }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState<string>(locale.displayName);
  const [validationError, setValidationError] = useState<string>();
  const update = useMutation(
    orpc.platform.projects.locales.updateDisplayName.mutationOptions({
      onSuccess: async (response) => {
        setOpen(false);
        await queryClient.invalidateQueries({
          queryKey: orpc.platform.projects.locales.key(),
        });
        toast.success(response.message);
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="icon-sm" variant="outline" />}>
        <PencilIcon aria-hidden="true" />
        <span className="sr-only">Edit {locale.displayName}</span>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit locale display name</DialogTitle>
          <DialogDescription>
            The canonical <span className="font-mono">{locale.tag}</span> tag and stable ID remain
            unchanged.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const result = localeFormSchema.safeParse({
              tag: locale.tag,
              displayName,
            });
            if (!result.success) {
              setValidationError(result.error.flatten().fieldErrors.displayName?.[0]);
              return;
            }
            setValidationError(undefined);
            update.mutate({
              localeId: locale.id,
              version: locale.version,
              displayName: result.data.displayName,
            });
          }}
        >
          <FieldGroup>
            <Field data-invalid={Boolean(validationError)}>
              <FieldLabel htmlFor={`locale-name-${locale.id}`}>Display name</FieldLabel>
              <Input
                id={`locale-name-${locale.id}`}
                value={displayName}
                required
                maxLength={100}
                aria-invalid={Boolean(validationError)}
                onChange={(event) => {
                  setDisplayName(event.target.value);
                  setValidationError(undefined);
                }}
              />
              <FieldError>{validationError}</FieldError>
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={update.isPending || displayName.trim() === locale.displayName}
              >
                {update.isPending ? <Spinner data-icon="inline-start" /> : null}
                Save name
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
