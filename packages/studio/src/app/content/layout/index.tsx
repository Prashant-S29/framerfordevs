import { useId, useMemo, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@framerfordevs/ui/components/button";
import { Input } from "@framerfordevs/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@framerfordevs/ui/components/native-select";
import { Textarea } from "@framerfordevs/ui/components/textarea";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@framerfordevs/ui/components/alert/dialog";

import { StudioContentClientError } from "../../../content-client";
import {
  createStudioPresentationClient,
  type StudioPresentationClient,
} from "../../../content-client/presentation";
import type { StudioPresentationDto } from "../../../contracts/presentation";
import { useStudioRuntime } from "../../shell";
import {
  contentErrorMessage,
  contentRetryDelay,
  retryContentQuery,
  useStudioContentContext,
} from "../data";
import {
  allGroups,
  emptyGroup,
  layoutDraft,
  layoutDraftValid,
  layoutPublishBody,
  moveItem,
  movePlacement,
  updateGroup,
  type LayoutDraft,
  type LayoutFieldDraft,
  type LayoutGroupDraft,
} from "./model";

const presentationQueryKey = (collectionId: string) =>
  ["studio", "content", "presentation", collectionId] as const;

export function layoutErrorMessage(error: Error | null): string {
  if (error instanceof StudioContentClientError) {
    switch (error.code) {
      case "PRESENTATION_SCOPE_RESTRICTED":
        return "Some fields in this form are hidden from your role. Ask a developer to change the layout.";
      case "PRESENTATION_ROLE_VISIBILITY_FORBIDDEN":
        return "This change would show or hide fields for a role. Only an owner or developer can change that.";
      case "STALE_SCHEMA":
        return "The form layout changed elsewhere. Reload the latest layout before publishing.";
      case "VALIDATION_ERROR":
        return "The form layout is not valid. Check the titles and labels, then try again.";
      default:
        return contentErrorMessage(error);
    }
  }
  return contentErrorMessage(error);
}

function MoveButtons(props: {
  readonly label: string;
  readonly index: number;
  readonly count: number;
  readonly onMove: (delta: -1 | 1) => void;
}) {
  return (
    <span className="studio-inline-actions">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={props.index === 0}
        aria-label={`Move ${props.label} up`}
        onClick={() => props.onMove(-1)}
      >
        Up
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={props.index === props.count - 1}
        aria-label={`Move ${props.label} down`}
        onClick={() => props.onMove(1)}
      >
        Down
      </Button>
    </span>
  );
}

function TextField(props: {
  readonly label: string;
  readonly value: string;
  readonly maxLength: number;
  readonly multiline?: boolean;
  readonly onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="studio-layout-field">
      <label htmlFor={id}>{props.label}</label>
      {props.multiline ? (
        <Textarea
          id={id}
          value={props.value}
          maxLength={props.maxLength}
          rows={2}
          onChange={(event) => props.onChange(event.target.value)}
        />
      ) : (
        <Input
          id={id}
          value={props.value}
          maxLength={props.maxLength}
          onChange={(event) => props.onChange(event.target.value)}
        />
      )}
    </div>
  );
}

function fieldName(field: LayoutFieldDraft | undefined): string {
  return field === undefined || field.displayLabel.trim() === ""
    ? "Untitled field"
    : field.displayLabel;
}

function GroupEditor(props: {
  readonly draft: LayoutDraft;
  readonly group: LayoutGroupDraft;
  readonly index: number;
  readonly count: number;
  readonly removable: boolean;
  readonly fields: ReadonlyMap<string, LayoutFieldDraft>;
  readonly onChange: (draft: LayoutDraft) => void;
  readonly onMove: (delta: -1 | 1) => void;
  readonly onRemove: () => void;
}) {
  const { draft, group } = props;
  const update = (next: (current: LayoutGroupDraft) => LayoutGroupDraft) =>
    props.onChange(updateGroup(draft, group.id, next));
  const targets = allGroups(draft);
  return (
    <fieldset className="studio-layout-group">
      <legend>Group: {group.title || "Untitled group"}</legend>
      <div className="studio-inline-actions">
        <MoveButtons
          label={`group ${group.title}`}
          index={props.index}
          count={props.count}
          onMove={props.onMove}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!props.removable || group.fields.length > 0}
          onClick={props.onRemove}
        >
          Remove group
        </Button>
      </div>
      <TextField
        label="Group title"
        value={group.title}
        maxLength={100}
        onChange={(title) => update((current) => ({ ...current, title }))}
      />
      <TextField
        label="Group description"
        value={group.description}
        maxLength={500}
        multiline
        onChange={(description) => update((current) => ({ ...current, description }))}
      />
      <div className="studio-layout-field">
        <label htmlFor={`${group.id}-columns`}>Columns</label>
        <NativeSelect
          id={`${group.id}-columns`}
          value={String(group.columns)}
          onChange={(event) =>
            update((current) => ({ ...current, columns: event.target.value === "2" ? 2 : 1 }))
          }
        >
          <NativeSelectOption value="1">One column</NativeSelectOption>
          <NativeSelectOption value="2">Two columns</NativeSelectOption>
        </NativeSelect>
      </div>
      {group.fields.length === 0 ? <p className="studio-muted">No fields in this group.</p> : null}
      <ol className="studio-layout-placements">
        {group.fields.map((placement, index) => {
          const name = fieldName(props.fields.get(placement.fieldId));
          return (
            <li key={placement.fieldId}>
              <strong>{name}</strong>
              <MoveButtons
                label={name}
                index={index}
                count={group.fields.length}
                onMove={(delta) =>
                  update((current) => ({
                    ...current,
                    fields: moveItem(current.fields, index, delta),
                  }))
                }
              />
              <div className="studio-layout-field">
                <label htmlFor={`${group.id}-${placement.fieldId}-target`}>Move {name} to</label>
                <NativeSelect
                  id={`${group.id}-${placement.fieldId}-target`}
                  value={group.id}
                  onChange={(event) =>
                    props.onChange(movePlacement(draft, placement.fieldId, event.target.value))
                  }
                >
                  {targets.map((target) => (
                    <NativeSelectOption key={target.id} value={target.id}>
                      {target.title || "Untitled group"}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <TextField
                label={`Help text in this group for ${name}`}
                value={placement.helpTextOverride}
                maxLength={500}
                onChange={(helpTextOverride) =>
                  update((current) => ({
                    ...current,
                    fields: current.fields.map((candidate) =>
                      candidate.fieldId === placement.fieldId
                        ? { ...candidate, helpTextOverride }
                        : candidate,
                    ),
                  }))
                }
              />
            </li>
          );
        })}
      </ol>
    </fieldset>
  );
}

function FieldEditor(props: {
  readonly field: LayoutFieldDraft;
  readonly onChange: (field: LayoutFieldDraft) => void;
}) {
  const { field } = props;
  return (
    <fieldset className="studio-layout-group" data-nested={field.parentFieldId !== null}>
      <legend>{fieldName(field)}</legend>
      <TextField
        label="Label"
        value={field.displayLabel}
        maxLength={100}
        onChange={(displayLabel) => props.onChange({ ...field, displayLabel })}
      />
      <TextField
        label="Help text"
        value={field.helpText}
        maxLength={500}
        multiline
        onChange={(helpText) => props.onChange({ ...field, helpText })}
      />
      <TextField
        label="Placeholder"
        value={field.placeholder}
        maxLength={200}
        onChange={(placeholder) => props.onChange({ ...field, placeholder })}
      />
      {field.enumOptions.length > 0 ? (
        <ol className="studio-layout-placements" aria-label={`${fieldName(field)} options`}>
          {field.enumOptions.map((option, index) => (
            <li key={option.optionId}>
              <TextField
                label={`Option ${index + 1} label`}
                value={option.label}
                maxLength={100}
                onChange={(label) =>
                  props.onChange({
                    ...field,
                    enumOptions: field.enumOptions.map((candidate) =>
                      candidate.optionId === option.optionId ? { ...candidate, label } : candidate,
                    ),
                  })
                }
              />
              <MoveButtons
                label={`option ${option.label}`}
                index={index}
                count={field.enumOptions.length}
                onMove={(delta) =>
                  props.onChange({
                    ...field,
                    enumOptions: moveItem(field.enumOptions, index, delta),
                  })
                }
              />
            </li>
          ))}
        </ol>
      ) : null}
    </fieldset>
  );
}

function LayoutEditor(props: {
  readonly presentation: StudioPresentationDto;
  readonly client: StudioPresentationClient;
  readonly onReload: () => void;
  readonly onPublished: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const initial = useMemo(() => layoutDraft(props.presentation), [props.presentation]);
  const [draft, setDraft] = useState(initial);
  const [confirming, setConfirming] = useState(false);
  const fields = useMemo(
    () => new Map(draft.fields.map((field) => [field.fieldId, field] as const)),
    [draft.fields],
  );
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const valid = layoutDraftValid(draft);
  const publish = useMutation({
    mutationFn: () =>
      props.client.publish(
        props.presentation.collectionId,
        layoutPublishBody(props.presentation, draft, crypto.randomUUID()),
        new AbortController().signal,
      ),
    retry: false,
    onSuccess: (result) => {
      setConfirming(false);
      props.onPublished(
        result.noOp
          ? "Nothing changed. The form layout is already current."
          : `Form layout published as revision ${result.presentation.sequence}.`,
      );
      queryClient.setQueryData(
        presentationQueryKey(props.presentation.collectionId),
        result.presentation,
      );
      void queryClient.invalidateQueries({ queryKey: ["studio", "content"], refetchType: "none" });
    },
    onError: () => setConfirming(false),
  });

  return (
    <div className="studio-stack">
      {publish.isError ? (
        <div role="alert" className="studio-panel">
          <p>{layoutErrorMessage(publish.error)}</p>
          {publish.error instanceof StudioContentClientError &&
          publish.error.code === "STALE_SCHEMA" ? (
            <Button type="button" variant="outline" onClick={props.onReload}>
              Reload latest layout
            </Button>
          ) : null}
        </div>
      ) : null}
      <section className="studio-panel studio-stack" aria-labelledby="layout-collection-heading">
        <h3 id="layout-collection-heading">Collection</h3>
        <TextField
          label="Collection name"
          value={draft.displayName}
          maxLength={100}
          onChange={(displayName) => setDraft((current) => ({ ...current, displayName }))}
        />
        <TextField
          label="Collection description"
          value={draft.description}
          maxLength={500}
          multiline
          onChange={(description) => setDraft((current) => ({ ...current, description }))}
        />
      </section>
      <section className="studio-panel studio-stack" aria-labelledby="layout-fields-heading">
        <h3 id="layout-fields-heading">Fields</h3>
        {draft.fields.map((field) => (
          <FieldEditor
            key={field.fieldId}
            field={field}
            onChange={(next) =>
              setDraft((current) => ({
                ...current,
                fields: current.fields.map((candidate) =>
                  candidate.fieldId === next.fieldId ? next : candidate,
                ),
              }))
            }
          />
        ))}
      </section>
      <section className="studio-panel studio-stack" aria-labelledby="layout-tabs-heading">
        <h3 id="layout-tabs-heading">Tabs and groups</h3>
        {draft.tabs.map((tab, tabIndex) => (
          <fieldset key={tab.id} className="studio-layout-tab">
            <legend>Tab: {tab.title || "Untitled tab"}</legend>
            <div className="studio-inline-actions">
              <MoveButtons
                label={`tab ${tab.title}`}
                index={tabIndex}
                count={draft.tabs.length}
                onMove={(delta) =>
                  setDraft((current) => ({
                    ...current,
                    tabs: moveItem(current.tabs, tabIndex, delta),
                  }))
                }
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={
                  draft.tabs.length === 1 || tab.groups.some((group) => group.fields.length > 0)
                }
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    tabs: current.tabs.filter((candidate) => candidate.id !== tab.id),
                  }))
                }
              >
                Remove tab
              </Button>
            </div>
            <TextField
              label="Tab title"
              value={tab.title}
              maxLength={100}
              onChange={(title) =>
                setDraft((current) => ({
                  ...current,
                  tabs: current.tabs.map((candidate) =>
                    candidate.id === tab.id ? { ...candidate, title } : candidate,
                  ),
                }))
              }
            />
            {tab.groups.map((group, groupIndex) => (
              <GroupEditor
                key={group.id}
                draft={draft}
                group={group}
                index={groupIndex}
                count={tab.groups.length}
                removable={tab.groups.length > 1}
                fields={fields}
                onChange={setDraft}
                onMove={(delta) =>
                  setDraft((current) => ({
                    ...current,
                    tabs: current.tabs.map((candidate) =>
                      candidate.id === tab.id
                        ? { ...candidate, groups: moveItem(candidate.groups, groupIndex, delta) }
                        : candidate,
                    ),
                  }))
                }
                onRemove={() =>
                  setDraft((current) => ({
                    ...current,
                    tabs: current.tabs.map((candidate) =>
                      candidate.id === tab.id
                        ? {
                            ...candidate,
                            groups: candidate.groups.filter((item) => item.id !== group.id),
                          }
                        : candidate,
                    ),
                  }))
                }
              />
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={tab.groups.length >= 20}
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  tabs: current.tabs.map((candidate) =>
                    candidate.id === tab.id
                      ? {
                          ...candidate,
                          groups: [
                            ...candidate.groups,
                            emptyGroup(crypto.randomUUID(), "New group"),
                          ],
                        }
                      : candidate,
                  ),
                }))
              }
            >
              Add group to {tab.title || "this tab"}
            </Button>
          </fieldset>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={draft.tabs.length >= 10}
          onClick={() =>
            setDraft((current) => ({
              ...current,
              tabs: [
                ...current.tabs,
                {
                  id: crypto.randomUUID(),
                  title: "New tab",
                  description: "",
                  groups: [emptyGroup(crypto.randomUUID(), "New group")],
                },
              ],
            }))
          }
        >
          Add tab
        </Button>
      </section>
      <section className="studio-panel studio-stack" aria-labelledby="layout-sidebar-heading">
        <h3 id="layout-sidebar-heading">Sidebar groups</h3>
        {draft.sidebarGroups.length === 0 ? (
          <p className="studio-muted">No sidebar groups.</p>
        ) : null}
        {draft.sidebarGroups.map((group, index) => (
          <GroupEditor
            key={group.id}
            draft={draft}
            group={group}
            index={index}
            count={draft.sidebarGroups.length}
            removable
            fields={fields}
            onChange={setDraft}
            onMove={(delta) =>
              setDraft((current) => ({
                ...current,
                sidebarGroups: moveItem(current.sidebarGroups, index, delta),
              }))
            }
            onRemove={() =>
              setDraft((current) => ({
                ...current,
                sidebarGroups: current.sidebarGroups.filter((item) => item.id !== group.id),
              }))
            }
          />
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={draft.sidebarGroups.length >= 10}
          onClick={() =>
            setDraft((current) => ({
              ...current,
              sidebarGroups: [
                ...current.sidebarGroups,
                emptyGroup(crypto.randomUUID(), "New sidebar group"),
              ],
            }))
          }
        >
          Add sidebar group
        </Button>
      </section>
      <div className="studio-save-bar">
        {!valid ? (
          <p role="alert">Every tab and group needs a title, and the collection needs a name.</p>
        ) : null}
        <Button type="button" variant="outline" disabled={!dirty} onClick={() => setDraft(initial)}>
          Discard changes
        </Button>
        <Button
          type="button"
          disabled={!dirty || !valid || publish.isPending}
          onClick={() => {
            publish.reset();
            setConfirming(true);
          }}
        >
          Publish form layout
        </Button>
      </div>
      <AlertDialog open={confirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish the form layout?</AlertDialogTitle>
            <AlertDialogDescription>
              Everyone who edits this collection sees the new labels and layout at once. Content and
              Delivery output do not change. Who can see each field does not change.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirming(false)}>Cancel</AlertDialogCancel>
            <Button type="button" disabled={publish.isPending} onClick={() => publish.mutate()}>
              {publish.isPending ? "Publishing…" : "Publish form layout"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function CollectionLayout() {
  const { collectionId = "" } = useParams({ strict: false });
  const { mountPath } = useStudioRuntime();
  const client = useMemo(() => createStudioPresentationClient({ mountPath }), [mountPath]);
  const context = useStudioContentContext();
  const collection = context.data?.collections.find((item) => item.id === collectionId);
  const allowed = collection?.capabilities.canPublishPresentation === true;
  const [status, setStatus] = useState<string | null>(null);
  const presentation = useQuery({
    queryKey: presentationQueryKey(collectionId),
    queryFn: ({ signal }) => client.get(collectionId, signal),
    enabled: allowed,
    retry: retryContentQuery,
    retryDelay: contentRetryDelay,
    staleTime: 0,
  });

  if (context.isPending) return <p role="status">Loading content access…</p>;
  if (collection === undefined || !allowed) {
    return (
      <div className="studio-panel" role="alert">
        <h2>Form layout unavailable</h2>
        <p>You cannot change the form layout of this collection.</p>
        <Link to="/content">Choose content</Link>
      </div>
    );
  }
  return (
    <section className="studio-stack" aria-labelledby="layout-heading">
      <div className="studio-breadcrumbs">
        <Link to="/content">Content</Link>
        <span aria-hidden="true">/</span>
        <span>{collection.displayName}</span>
        <span aria-hidden="true">/</span>
        <span>Form layout</span>
      </div>
      <div>
        <h2 id="layout-heading">Form layout</h2>
        <p className="studio-muted">
          Change labels, help text, order, tabs, and groups. Field structure and who can see each
          field stay with the developer.
        </p>
      </div>
      <p role="status" className="studio-muted">
        {presentation.isPending ? "Loading form layout…" : (status ?? "")}
      </p>
      {presentation.isError ? (
        <div className="studio-panel" role="alert">
          <p>{layoutErrorMessage(presentation.error)}</p>
          <Button type="button" variant="outline" onClick={() => void presentation.refetch()}>
            Try again
          </Button>
        </div>
      ) : null}
      {presentation.data ? (
        <LayoutEditor
          key={presentation.data.revisionId}
          presentation={presentation.data}
          client={client}
          onReload={() => void presentation.refetch()}
          onPublished={setStatus}
        />
      ) : null}
    </section>
  );
}
