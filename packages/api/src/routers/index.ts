import type { RouterClient } from "@orpc/server";

import { executeProcedure, protectedProcedure, publicProcedure } from "../index";
import { healthCheck, loadPrivateData } from "../operations/system";

export const appRouter = {
  healthCheck: publicProcedure.handler(({ context }) =>
    executeProcedure(context, "api.health", healthCheck(), "Service is healthy."),
  ),
  privateData: protectedProcedure.handler(({ context }) =>
    executeProcedure(
      context,
      "api.private-data",
      loadPrivateData(context.session),
      "Private data loaded.",
    ),
  ),
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
