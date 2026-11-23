import type { IncomingMessage } from "node:http";

import {
  escapeStudioHtml,
  studioPreviewLaunchMessages,
  validPreviewHandoff,
} from "@framerfordevs/studio/bff-routes";

import type { EditorUpstreamRequest, EditorUpstreamResponse } from "../loopback";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const localeTag = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u;

export interface EditorPreviewLaunchInput {
  readonly request: IncomingMessage;
  readonly method: string;
  readonly query: string;
  readonly previewUrl: string | null;
  readonly mountPath: string;
  readonly handoffPath: (collection: string, locale: string, entry: string) => string;
  readonly upstream: (request: EditorUpstreamRequest) => Promise<EditorUpstreamResponse>;
  readonly requestId: string;
}

export interface EditorPreviewLaunchResponse {
  readonly status: number;
  readonly html: string;
  readonly csp: string;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function page(previewUrl: string | null, status: number, content: string) {
  const formAction = previewUrl === null ? "'none'" : new URL(previewUrl).origin;
  return {
    status,
    html: `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Preview</title>${content}</html>\n`,
    csp: `default-src 'none'; script-src 'self'; style-src 'none'; img-src 'none'; connect-src 'none'; form-action ${formAction}; base-uri 'none'; object-src 'none'; frame-ancestors 'self'`,
  };
}

function message(previewUrl: string | null, status: number, text: string) {
  return page(
    previewUrl,
    status,
    `</head><body><p role="alert">${escapeStudioHtml(text)}</p></body>`,
  );
}

function parseUpstream(response: EditorUpstreamResponse): unknown {
  if (response.contentType?.toLowerCase().startsWith("application/json") !== true) return null;
  try {
    return JSON.parse(response.text);
  } catch {
    return null;
  }
}

export async function previewLaunchResponse(
  input: EditorPreviewLaunchInput,
): Promise<EditorPreviewLaunchResponse> {
  const previewUrl = input.previewUrl;
  if (previewUrl === null || input.method !== "GET") {
    return message(previewUrl, 404, "Preview is off for this environment.");
  }
  if (
    input.request.headers["sec-fetch-site"] !== "same-origin" ||
    input.request.headers["sec-fetch-dest"] !== "iframe"
  ) {
    return message(previewUrl, 403, "The Preview request origin is not allowed.");
  }
  const parameters = new URLSearchParams(input.query);
  const keys = [...parameters.keys()];
  const collection = parameters.get("collection") ?? "";
  const locale = parameters.get("locale") ?? "";
  const entry = parameters.get("entry") ?? "";
  const revision = parameters.get("revision");
  if (
    keys.length !== new Set(keys).size ||
    keys.some((key) => !["collection", "locale", "entry", "revision"].includes(key)) ||
    !uuid.test(collection) ||
    !uuid.test(entry) ||
    locale.length > 35 ||
    !localeTag.test(locale) ||
    (revision !== null && !uuid.test(revision))
  ) {
    return message(previewUrl, 400, "The Preview request is invalid.");
  }
  const upstream = await input.upstream({
    path: input.handoffPath(collection, locale, entry),
    method: "POST",
    requestId: input.requestId,
    maximumResponseBytes: 16 * 1_024,
    body: JSON.stringify(
      revision === null
        ? { source: "current", revisionId: null }
        : { source: "revision", revisionId: revision },
    ),
  });
  const body = parseUpstream(upstream);
  if (validPreviewHandoff(body, upstream.status, previewUrl)) {
    return page(
      previewUrl,
      200,
      `<script src="${input.mountPath}/preview/launch.js" defer></script></head><body><form id="ffd-preview-launch" method="post" action="${escapeStudioHtml(previewUrl)}"><input type="hidden" name="token" value="${body.data.token}"><noscript><button type="submit">Open preview</button></noscript></form></body>`,
    );
  }
  const code =
    isRecord(body) && isRecord(body.error) && typeof body.error.code === "string"
      ? body.error.code
      : "";
  const text =
    studioPreviewLaunchMessages[code] ??
    (isRecord(body) && body.ok === true
      ? "The Preview URL changed. Stop ffd editor and start it again."
      : "Preview could not open. Try again.");
  return message(previewUrl, upstream.status >= 400 ? upstream.status : 502, text);
}
