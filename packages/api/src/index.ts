import { ORPCError, onError, os } from "@orpc/server";
import { Effect } from "effect";

import {
  ApiErrorDetail,
  type ApiData,
  type ApiFailure,
  type ApiSuccess,
} from "./contracts/api-response";
import { type ApplicationError, ValidationFailure } from "./contracts/errors";
import type { Context } from "./context";
import { requireSession } from "./operations/system";
import type { ApplicationServices } from "./runtime";

export const o = os.$context<Context>();

export const publicProcedure = o;

interface ValidationIssueLike {
  readonly message: string;
  readonly path?: ReadonlyArray<unknown>;
}

function isValidationIssue(value: unknown): value is ValidationIssueLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string"
  );
}

function validationIssues(value: unknown): ReadonlyArray<ValidationIssueLike> | undefined {
  if (typeof value !== "object" || value === null || !("issues" in value)) return undefined;
  if (!Array.isArray(value.issues) || !value.issues.every(isValidationIssue)) return undefined;
  return value.issues;
}

function validationDetails(
  issues: ReadonlyArray<ValidationIssueLike>,
): ReadonlyArray<ApiErrorDetail> {
  return issues.slice(0, 50).map((issue) => {
    const path = Array.isArray(issue.path)
      ? issue.path
          .slice(0, 16)
          .map((segment) =>
            typeof segment === "object" && segment !== null && "key" in segment
              ? String(segment.key)
              : String(segment),
          )
          .join(".")
      : undefined;
    return ApiErrorDetail.make({
      ...(path ? { path } : {}),
      code: "invalid_input",
      message: issue.message.slice(0, 512),
    });
  });
}

async function remapValidationFailure(context: Context, error: unknown): Promise<void> {
  if (error instanceof ORPCError && error.code === "BAD_REQUEST") {
    const issues = validationIssues(error.cause) ?? validationIssues(error.data);
    if (!issues) return;
    const details = validationDetails(issues);
    const result = await context.execute(
      "api.input.validate",
      Effect.fail(
        ValidationFailure.make({
          details:
            details.length > 0
              ? details
              : [
                  ApiErrorDetail.make({
                    code: "invalid_input",
                    message: "The request input is invalid.",
                  }),
                ],
        }),
      ),
      "Input validated.",
    );
    if (!result.response.ok) {
      throw toORPCError(result.response, result.status);
    }
  }
}

export function toORPCError(failure: ApiFailure, status: number): ORPCError<string, ApiFailure> {
  return new ORPCError(failure.error.code, {
    status,
    message: failure.message,
    data: failure,
  });
}

export async function executeProcedure<A extends ApiData>(
  context: Context,
  operation: string,
  effect: Effect.Effect<A, ApplicationError, ApplicationServices>,
  successMessage: string,
): Promise<ApiSuccess<A>> {
  const result = await context.execute(operation, effect, successMessage);
  if (!result.response.ok) {
    throw toORPCError(result.response, result.status);
  }
  return result.response;
}

const requireAuth = o.middleware(async ({ context, next }) => {
  const result = await context.execute(
    "auth.session.require",
    requireSession(context.headers),
    "Session loaded.",
  );

  if (!result.response.ok) {
    throw toORPCError(result.response, result.status);
  }

  return next({
    context: {
      session: result.response.data,
    },
  });
});

export const protectedProcedure = publicProcedure
  .use(
    onError(async (error, { context }) => {
      await remapValidationFailure(context, error);
    }),
  )
  .use(requireAuth);
