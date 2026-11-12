import { Context, Effect, Layer, Schema } from "effect";

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
      return yield* Schema.decodeUnknownEffect(PreviewItem)(result.item).pipe(
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
