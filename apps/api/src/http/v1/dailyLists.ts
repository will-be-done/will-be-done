import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { authenticateRequest } from "../../services/authentication";
import { DatabaseAccessDeniedError } from "../../services/databaseAccess";
import { listDailyListItems } from "../../services/dailyLists";
import {
  DailyListItemsParamsSchema,
  DailyListItemsQuerySchema,
  DailyListItemsResponseSchema,
  ErrorResponseSchema,
} from "../schemas";
import { unauthorized } from "../errors";

export const dailyListRoutes: FastifyPluginAsyncZod = async (server) => {
  server.get(
    "/spaces/:spaceId/daily-lists/:date/items",
    {
      schema: {
        operationId: "listDailyListItems",
        summary: "List daily-list items",
        description:
          "Returns scheduled todo tasks in daily-list order by default, or completed tasks ordered by most recently completed.",
        tags: ["Daily lists"],
        security: [{ bearerAuth: [] }],
        params: DailyListItemsParamsSchema,
        querystring: DailyListItemsQuerySchema,
        response: {
          200: DailyListItemsResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const user = authenticateRequest(request);
      if (!user) return unauthorized(reply);

      try {
        const items = listDailyListItems({
          spaceId: request.params.spaceId,
          userId: user.id,
          date: request.params.date,
          state: request.query.state,
        });
        return reply.code(200).send({ items });
      } catch (error) {
        if (error instanceof DatabaseAccessDeniedError) {
          return reply.code(403).send({
            code: "FORBIDDEN",
            message: "You do not have access to this space",
          });
        }
        request.log.error(error, "Failed to list daily-list items");
        return reply.code(500).send({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to list daily-list items",
        });
      }
    },
  );
};
