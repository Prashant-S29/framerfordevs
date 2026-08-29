// Builds secondary API-reference pages exclusively from canonical public contract artifacts.

import authoringDocument from "@framerfordevs/public-contracts/artifacts/authoring/v1/openapi.json?raw";
import deliveryDocument from "@framerfordevs/public-contracts/artifacts/delivery/v1/openapi.json?raw";
import previewDocument from "@framerfordevs/public-contracts/artifacts/preview/v1/openapi.json?raw";
import toolingDocument from "@framerfordevs/public-contracts/artifacts/tooling/v1/openapi.json?raw";
import { loader } from "fumadocs-core/source";
import type { OpenAPIV3_2 } from "fumadocs-openapi";
import { createOpenAPI, type OpenAPISourceOptions } from "fumadocs-openapi/server";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validates the minimal document boundary required by Fumadocs' internal 3.1-to-3.2 upgrader. */
function isFumadocsDocument(value: unknown): value is OpenAPIV3_2.Document {
  return (
    isRecord(value) &&
    value.openapi === "3.2.0" &&
    isRecord(value.info) &&
    typeof value.info.title === "string" &&
    typeof value.info.version === "string" &&
    isRecord(value.paths)
  );
}

/** Decodes verified canonical JSON and adapts the version marker Fumadocs upgrades internally. */
function decodeDocument(rawDocument: string): OpenAPIV3_2.Document {
  const parsed: unknown = JSON.parse(rawDocument);
  if (!isRecord(parsed) || parsed.openapi !== "3.1.0") {
    throw new Error("The canonical API reference is not an OpenAPI 3.1 document.");
  }

  const candidate: unknown = { ...parsed, openapi: "3.2.0" };
  if (!isFumadocsDocument(candidate)) {
    throw new Error("The canonical API reference is missing required document authority.");
  }
  return candidate;
}

const authoring = createOpenAPI({ input: { authoring: decodeDocument(authoringDocument) } });
const delivery = createOpenAPI({ input: { delivery: decodeDocument(deliveryDocument) } });
const preview = createOpenAPI({ input: { preview: decodeDocument(previewDocument) } });
const tooling = createOpenAPI({ input: { tooling: decodeDocument(toolingDocument) } });

/** Gives each family one stable version-root contract page. */
function indexPageName() {
  return "index";
}

const familyPage = {
  per: "file",
  name: indexPageName,
} satisfies OpenAPISourceOptions;

export const apiContractSource = loader(
  {
    authoring: await authoring.staticSource({ ...familyPage, baseDir: "authoring/v1" }),
    delivery: await delivery.staticSource({ ...familyPage, baseDir: "delivery/v1" }),
    preview: await preview.staticSource({ ...familyPage, baseDir: "preview/v1" }),
    tooling: await tooling.staticSource({ ...familyPage, baseDir: "tooling/v1" }),
  },
  {
    baseUrl: "/api-reference",
    plugins: [delivery.loaderPlugin()],
  },
);
