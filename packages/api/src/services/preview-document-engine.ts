// Exposes permissive bounded Preview compilation through a replaceable named Effect service.

import { Context, Effect, Layer, Schema } from "effect";

import { PreviewItem, previewLimits } from "../contracts/preview";
import { PreviewDocumentCorruptFailure, PreviewResponseTooLargeFailure } from "../contracts/errors";
import {
  compilePreviewDocument,
  type CompilePreviewDocumentInput,
  type PreviewDocumentCompilationResult,
} from "../lib/preview-document";

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
      return yield* Schema.decodeUnknown(PreviewItem)(result.item).pipe(
        Effect.mapError(() => PreviewDocumentCorruptFailure.make()),
      );
    }),
  };
}

export class PreviewDocumentEngine extends Context.Tag("PreviewDocumentEngine")<
  PreviewDocumentEngine,
  ReturnType<typeof makePreviewDocumentEngine>
>() {}

export const PreviewDocumentEngineLive = Layer.succeed(
  PreviewDocumentEngine,
  makePreviewDocumentEngine(),
);
