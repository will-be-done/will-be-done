import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { authenticateBearerToken } from "../../services/authentication";
import { DatabaseAccessDeniedError } from "../../services/databaseAccess";
import { ResourceNotFoundError } from "../../services/errors";
import {
  listDailyListItems,
  listDailyListsInRange,
} from "../../services/dailyLists";
import {
  DailyListItemsParamsSchema,
  DailyListItemsQuerySchema,
  DailyListItemsResponseSchema,
  DailyListsRangeQuerySchema,
  DailyListsRangeResponseSchema,
  ErrorResponseSchema,
  SpaceParamsSchema,
} from "../schemas";
import { unauthorized } from "../errors";

export const dailyListRoutes: FastifyPluginAsyncZod = async (server) => {
  server.get(
    "/spaces/:spaceId/daily-lists",
    {
      schema: {
        operationId: "listDailyLists",
        summary: "List daily lists in a date range",
        description:
          "Returns existing daily lists in ascending date order. Empty dates are omitted.",
        tags: ["Daily lists"],
        security: [{ bearerAuth: [] }],
        params: SpaceParamsSchema,
        querystring: DailyListsRangeQuerySchema,
        response: {
          200: DailyListsRangeResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const user = authenticateBearerToken(request.headers.authorization);
      if (!user) return unauthorized(reply);

      try {
        const dailyLists = listDailyListsInRange({
          spaceId: request.params.spaceId,
          userId: user.id,
          ...request.query,
        });
        return reply.code(200).send({ dailyLists });
      } catch (error) {
        if (error instanceof DatabaseAccessDeniedError) {
          return reply.code(403).send({
            code: "FORBIDDEN",
            message: "You do not have access to this space",
          });
        }
        if (error instanceof ResourceNotFoundError) {
          return reply
            .code(404)
            .send({ code: "NOT_FOUND", message: error.message });
        }
        request.log.error(error, "Failed to list daily lists");
        return reply.code(500).send({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to list daily lists",
        });
      }
    },
  );

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
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const user = authenticateBearerToken(request.headers.authorization);
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
        if (error instanceof ResourceNotFoundError) {
          return reply
            .code(404)
            .send({ code: "NOT_FOUND", message: error.message });
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
