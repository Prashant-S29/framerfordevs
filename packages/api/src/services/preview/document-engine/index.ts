// Exposes permissive bounded Preview compilation through a replaceable named Effect service.

import { Context, Effect, Layer } from "effect";

import { PreviewItem, previewLimits } from "../../../contracts/preview";
import {
  PreviewDocumentCorruptFailure,
  PreviewResponseTooLargeFailure,
} from "../../../contracts/response/errors";
import {
  compilePreviewDocument,
  type CompilePreviewDocumentInput,
  type PreviewDocumentCompilationResult,
} from "../../../lib/preview/document";

import * as SchemaStrict from "../../../lib/schema-strict";
/** Creates the typed Preview compiler service without runtime-local provisioning. */
export function makePreviewDocumentEngine(
  options: {
    readonly compile?: (input: CompilePreviewDocumentInput) => PreviewDocumentCompilationResult;
  } = {},
) {
  const compile = options.compile ?? compilePreviewDocument;
  return {
    compileSync: compile,
    compile: Effect.fn("PreviewDocumentEngine.compile")(function* (
      input: CompilePreviewDocumentInput,
    ) {
      const result = compile(input);
      if (!result.ok) return yield* PreviewDocumentCorruptFailure.make();
      if (result.responseBytes > previewLimits.responseBytes) {
        return yield* PreviewResponseTooLargeFailure.make();
      }
      return yield* SchemaStrict.decodeUnknownEffect(PreviewItem)(result.item).pipe(
        Effect.mapError(() => PreviewDocumentCorruptFailure.make()),
      );
    }),
  };
}

export class PreviewDocumentEngine extends Context.Service<
  PreviewDocumentEngine,
  ReturnType<typeof makePreviewDocumentEngine>
>()("PreviewDocumentEngine") {}

export const PreviewDocumentEngineLive = Layer.succeed(
  PreviewDocumentEngine,
  makePreviewDocumentEngine(),
);
