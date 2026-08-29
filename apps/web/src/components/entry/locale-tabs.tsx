import type { ProjectLocale } from "@framerfordevs/api/contracts/locale/index";
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
import { Button } from "@framerfordevs/ui/components/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@framerfordevs/ui/components/tabs";
import { type ReactNode, useState } from "react";

interface LocaleTabsProps {
  readonly locales: ReadonlyArray<ProjectLocale>;
  readonly selectedLocaleId: string;
  readonly onSelectedLocaleChange: (localeId: string) => void;
  readonly hasUnsavedChanges: boolean;
  readonly renderContent: (locale: ProjectLocale) => ReactNode;
}

export function LocaleTabs({
  locales,
  selectedLocaleId,
  onSelectedLocaleChange,
  hasUnsavedChanges,
  renderContent,
}: LocaleTabsProps) {
  const [pendingLocaleId, setPendingLocaleId] = useState<string | null>(null);
  const selectedLocale = locales.find((locale) => locale.id === selectedLocaleId);
  const pendingLocale = locales.find((locale) => locale.id === pendingLocaleId);

  function requestSelection(localeId: string) {
    if (localeId === selectedLocaleId) return;
    if (hasUnsavedChanges) {
      setPendingLocaleId(localeId);
      return;
    }
    onSelectedLocaleChange(localeId);
  }

  if (locales.length === 0) {
    return <p className="text-muted-foreground text-sm">No enabled locales are available.</p>;
  }

  if (!selectedLocale) {
    return (
      <div className="flex flex-col gap-3" role="status">
        <p className="font-medium text-sm">The selected locale is no longer available.</p>
        <p className="text-muted-foreground text-sm">
          Choose an enabled locale explicitly. No fallback locale was selected automatically.
        </p>
        <Button
          variant="outline"
          className="self-start"
          onClick={() => onSelectedLocaleChange(locales[0]?.id ?? "")}
        >
          Select {locales[0]?.displayName}
        </Button>
      </div>
    );
  }

  return (
    <>
      <Tabs value={selectedLocaleId} onValueChange={requestSelection}>
        <TabsList aria-label="Content locales" className="max-w-full justify-start overflow-x-auto">
          {locales.map((locale) => (
            <TabsTrigger key={locale.id} value={locale.id}>
              <span>{locale.displayName}</span>
              <span className="text-muted-foreground" translate="no">
                {locale.tag}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        {locales.map((locale) => (
          <TabsContent key={locale.id} value={locale.id} className="pt-4">
            {renderContent(locale)}
          </TabsContent>
        ))}
      </Tabs>
      <p className="sr-only" aria-live="polite">
        Selected locale: {selectedLocale.displayName} ({selectedLocale.tag})
      </p>
      <AlertDialog
        open={pendingLocaleId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingLocaleId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch locale with unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Unsaved changes in {selectedLocale.displayName} may be lost. Confirm before switching
              to {pendingLocale?.displayName ?? "another locale"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingLocaleId) onSelectedLocaleChange(pendingLocaleId);
                setPendingLocaleId(null);
              }}
            >
              Switch locale
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
