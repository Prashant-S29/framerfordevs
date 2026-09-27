// Thin TanStack Start/Nitro bridge. The host must supply the raw request-target before URL normalization.

import type { StudioFetchHandler } from "@framerfordevs/studio-server";
import { parseStudioRawTarget } from "@framerfordevs/studio-server/raw-target";

export interface TanStackStudioRequest {
  readonly request: Request;
  /** Read from the runtime event's original request URL, never reconstructed from URL.pathname. */
  readonly rawTarget: string;
}

export type TanStackStudioHandler = (input: TanStackStudioRequest) => Promise<Response | undefined>;

export function createTanStackStartStudioHandler(
  handler: StudioFetchHandler,
): TanStackStudioHandler {
  return ({ request, rawTarget }) => {
    const ownsTarget =
      rawTarget === handler.mountPath ||
      rawTarget.startsWith(`${handler.mountPath}/`) ||
      rawTarget.startsWith(`${handler.mountPath}?`) ||
      rawTarget.startsWith(`${handler.mountPath}%`) ||
      rawTarget.startsWith(`${handler.mountPath}\\`);
    if (!ownsTarget) return Promise.resolve(undefined);
    if (parseStudioRawTarget(rawTarget, handler.mountPath) === null)
      return Promise.resolve(invalidRequest());
    let origin = "";
    try {
      origin = new URL(request.url).origin;
    } catch {
      /* rejected below */
    }
    if (origin !== handler.applicationOrigin) return Promise.resolve(invalidRequest());
    return handler.fetch(request, { rawTarget });
  };
}

function invalidRequest(): Response {
  return new Response(
    `${JSON.stringify({
      ok: false,
      data: null,
      error: { code: "STUDIO_REQUEST_INVALID", message: "The request is invalid." },
      message: "The request is invalid.",
    })}\n`,
    {
      status: 400,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
