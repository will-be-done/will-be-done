import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { Effect } from "effect";
import { authenticateRequest } from "../../services/authentication";
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
import { runRoute, unauthorized } from "../errors";

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
      const user = await authenticateRequest(request);
      if (!user) return unauthorized(reply);

      return runRoute(
        request,
        reply,
        "Failed to list daily lists",
        Effect.gen(function* () {
          const result = yield* listDailyListsInRange({
            spaceId: request.params.spaceId,
            userId: user.id,
            ...request.query,
          });
          return reply.code(200).send(result);
        }),
      );
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
      const user = await authenticateRequest(request);
      if (!user) return unauthorized(reply);

      return runRoute(
        request,
        reply,
        "Failed to list daily-list items",
        Effect.gen(function* () {
          const items = yield* listDailyListItems({
            spaceId: request.params.spaceId,
            userId: user.id,
            date: request.params.date,
            state: request.query.state,
          });
          return reply.code(200).send({ items });
        }),
      );
    },
  );
};
