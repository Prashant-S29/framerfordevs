import { AlertTriangle, Braces, ExternalLink, LogOut, RefreshCw } from "lucide-react";
import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button, buttonVariants } from "@framerfordevs/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@framerfordevs/ui/components/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@framerfordevs/ui/components/empty";
import { Alert, AlertDescription } from "@framerfordevs/ui/components/alert";

import {
  decodeStudioBrowserResponse,
  type StudioBrowserBootstrap,
  type StudioBrowserErrorCode,
} from "../contracts";

const DirtySignOutDialog = lazy(() => import("./content/dirty-sign-out-dialog"));
const maximumResponseBytes = 262_144;
interface StudioRuntimeContext {
  readonly bootstrap: StudioBrowserBootstrap;
  readonly mountPath: string;
  readonly setWorkspaceDirty: (dirty: boolean) => void;
  readonly allowWorkspaceNavigation: () => void;
  readonly disallowWorkspaceNavigation: () => void;
  readonly isWorkspaceNavigationAllowed: () => boolean;
}
const StudioBootstrapContext = createContext<StudioRuntimeContext | null>(null);

export interface StudioShellProps {
  readonly mountPath: string;
  readonly dashboardOrigin: string;
  readonly children?: ReactNode;
}

class BootstrapFailure extends Error {
  readonly code: StudioBrowserErrorCode;
  constructor(code: StudioBrowserErrorCode, message: string) {
    super(message);
    this.name = "BootstrapFailure";
    this.code = code;
  }
}

async function loadBootstrap(mountPath: string) {
  const response = await fetch(`${mountPath}/api/bootstrap`, {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > maximumResponseBytes) {
    throw new BootstrapFailure("STUDIO_UPSTREAM_UNAVAILABLE", "The response was too large.");
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maximumResponseBytes) {
    throw new BootstrapFailure("STUDIO_UPSTREAM_UNAVAILABLE", "The response was too large.");
  }
  let decoded;
  try {
    decoded = decodeStudioBrowserResponse(JSON.parse(text));
  } catch {
    throw new BootstrapFailure(
      "STUDIO_UPSTREAM_UNAVAILABLE",
      "Studio returned an invalid response.",
    );
  }
  if (!decoded.ok) throw new BootstrapFailure(decoded.error.code, decoded.message);
  return decoded.data;
}

function DashboardLink({ dashboardOrigin }: { readonly dashboardOrigin: string }) {
  return (
    <a className={buttonVariants({ variant: "outline" })} href={dashboardOrigin}>
      Open dashboard <ExternalLink aria-hidden="true" />
    </a>
  );
}

function ErrorState({
  error,
  mountPath,
  dashboardOrigin,
}: {
  readonly error: Error;
  readonly mountPath: string;
  readonly dashboardOrigin: string;
}) {
  const queryClient = useQueryClient();
  const main = useRef<HTMLElement>(null);
  useEffect(() => main.current?.focus(), []);
  const failure = error instanceof BootstrapFailure ? error : null;
  const requiresLogin =
    failure?.code === "STUDIO_AUTH_REQUIRED" || failure?.code === "STUDIO_SESSION_INVALID";
  const denied = failure?.code === "STUDIO_ORIGIN_INVALID" || failure?.code === "STUDIO_FORBIDDEN";
  const unavailableProject =
    failure?.code === "STUDIO_PROJECT_UNAVAILABLE" ||
    failure?.code === "STUDIO_CMS_DISABLED" ||
    failure?.code === "STUDIO_REGISTRATION_INACTIVE";
  return (
    <main ref={main} className="studio-center" aria-labelledby="studio-error-title" tabIndex={-1}>
      <Alert variant="destructive" className="studio-alert">
        <AlertTriangle aria-hidden="true" />
        <h1 id="studio-error-title" className="studio-alert-title">
          {requiresLogin
            ? "Your Studio session has ended"
            : denied
              ? "Access denied"
              : unavailableProject
                ? "Studio needs attention"
                : "Studio is unavailable"}
        </h1>
        <AlertDescription>
          {requiresLogin
            ? "Sign in again to continue. Your content remains unchanged."
            : denied
              ? "Your current project role does not allow this Studio session."
              : unavailableProject
                ? "The project, CMS capability, or Studio registration is not currently active. Use the dashboard to recover it."
                : "The service could not be reached. Try again without reloading the page."}
        </AlertDescription>
      </Alert>
      <div className="studio-actions">
        {requiresLogin ? (
          <Button onClick={() => window.location.assign(`${mountPath}/auth/login`)}>Sign in</Button>
        ) : (
          <Button
            onClick={() =>
              void queryClient.invalidateQueries({ queryKey: ["studio", "bootstrap"] })
            }
          >
            <RefreshCw aria-hidden="true" /> Retry
          </Button>
        )}
        <DashboardLink dashboardOrigin={dashboardOrigin} />
      </div>
    </main>
  );
}

export function StudioNotFound({ dashboardOrigin }: { readonly dashboardOrigin: string }) {
  return (
    <main className="studio-center" aria-labelledby="studio-not-found-title" id="main-content">
      <Alert className="studio-alert">
        <AlertTriangle aria-hidden="true" />
        <h1 id="studio-not-found-title" className="studio-alert-title">
          Studio page not found
        </h1>
        <AlertDescription>
          This path is not part of the mounted Studio application. Return to the dashboard to
          recover.
        </AlertDescription>
      </Alert>
      <div className="studio-actions">
        <DashboardLink dashboardOrigin={dashboardOrigin} />
      </div>
    </main>
  );
}

export function useStudioRuntime(): StudioRuntimeContext {
  const runtime = useContext(StudioBootstrapContext);
  if (runtime === null) throw new Error("Studio bootstrap context is unavailable.");
  return runtime;
}

export function useStudioBootstrap(): StudioBrowserBootstrap {
  return useStudioRuntime().bootstrap;
}

export function StudioHome({ bootstrap }: { readonly bootstrap: StudioBrowserBootstrap }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{bootstrap.project.name}</CardTitle>
        <CardDescription>
          {bootstrap.environment.name} · {bootstrap.role} · {bootstrap.user.name}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Braces aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Studio is connected</EmptyTitle>
            <EmptyDescription>
              Your project authority is ready. Choose Content to begin exact-locale authoring.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <p className="studio-muted">
              Current access expires {new Date(bootstrap.session.expiresAt).toLocaleTimeString()}.
            </p>
            <p className="studio-muted">
              Signing out here leaves your dashboard session active. Your next Studio login requires
              acknowledgement but may not require credentials.
            </p>
          </EmptyContent>
        </Empty>
      </CardContent>
    </Card>
  );
}

export function StudioShell({ mountPath, dashboardOrigin, children }: StudioShellProps) {
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const [workspaceDirty, setWorkspaceDirty] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const workspaceNavigationAllowed = useRef(false);
  const allowWorkspaceNavigation = useCallback(() => {
    workspaceNavigationAllowed.current = true;
  }, []);
  const disallowWorkspaceNavigation = useCallback(() => {
    workspaceNavigationAllowed.current = false;
  }, []);
  const isWorkspaceNavigationAllowed = useCallback(() => workspaceNavigationAllowed.current, []);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["studio", "bootstrap"],
    queryFn: () => loadBootstrap(mountPath),
    retry: false,
    staleTime: 30_000,
  });

  if (query.isPending) {
    return (
      <main
        className="studio-center"
        aria-busy="true"
        aria-label="Loading Studio"
        aria-live="polite"
      >
        <div className="studio-loader" />
        <p>Loading Studio…</p>
      </main>
    );
  }
  if (query.isError)
    return (
      <ErrorState error={query.error} mountPath={mountPath} dashboardOrigin={dashboardOrigin} />
    );

  const bootstrap = query.data;
  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError(false);
    try {
      const response = await fetch(`${mountPath}/auth/logout`, {
        method: "POST",
        credentials: "same-origin",
        redirect: "manual",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (response.type !== "opaqueredirect" && response.status !== 303)
        throw new Error("STUDIO_LOGOUT_FAILED");
      queryClient.removeQueries({ queryKey: ["studio"] });
      allowWorkspaceNavigation();
      setWorkspaceDirty(false);
      window.location.assign(mountPath);
    } catch {
      setSignOutError(true);
      setSigningOut(false);
    }
  };
  return (
    <StudioBootstrapContext.Provider
      value={{
        bootstrap,
        mountPath,
        setWorkspaceDirty,
        allowWorkspaceNavigation,
        disallowWorkspaceNavigation,
        isWorkspaceNavigationAllowed,
      }}
    >
      <div className="studio-layout">
        <header className="studio-header">
          <div>
            <p className="studio-eyebrow">Framer for Developers</p>
            <h1>Studio</h1>
          </div>
          <nav aria-label="Studio navigation and account actions">
            <Link className={buttonVariants({ variant: "outline" })} to="/content">
              Content
            </Link>
            <DashboardLink dashboardOrigin={dashboardOrigin} />
            <Button
              type="button"
              variant="outline"
              disabled={signingOut}
              onClick={() => {
                if (workspaceDirty) setConfirmSignOut(true);
                else void signOut();
              }}
            >
              <LogOut aria-hidden="true" /> {signingOut ? "Signing out…" : "Sign out"}
            </Button>
            {signOutError ? (
              <p className="studio-muted" role="status">
                Sign out could not be completed. Try again.
              </p>
            ) : null}
          </nav>
        </header>
        <main className="studio-main" id="main-content">
          {children ?? <StudioHome bootstrap={bootstrap} />}
        </main>
      </div>
      {confirmSignOut ? (
        <Suspense fallback={null}>
          <DirtySignOutDialog
            open
            onCancel={() => setConfirmSignOut(false)}
            onConfirm={() => {
              setConfirmSignOut(false);
              void signOut();
            }}
          />
        </Suspense>
      ) : null}
    </StudioBootstrapContext.Provider>
  );
}
