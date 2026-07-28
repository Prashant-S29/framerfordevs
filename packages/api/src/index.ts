import { ORPCError, os } from "@orpc/server";
import type { Effect } from "effect";

import type { ApiData, ApiFailure, ApiSuccess } from "./contracts/api-response";
import type { ApplicationError } from "./contracts/errors";
import type { Context } from "./context";
import { requireSession } from "./operations/system";
import type { ApplicationServices } from "./runtime";

export const o = os.$context<Context>();

export const publicProcedure = o;

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

export const protectedProcedure = publicProcedure.use(requireAuth);
