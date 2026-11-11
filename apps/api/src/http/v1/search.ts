import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { authenticateBearerToken } from "../../services/authentication";
import { searchSpace } from "../../services/search";
import { sendError, unauthorized } from "../errors";
import {
  ErrorResponseSchema,
  SearchQuerySchema,
  SearchResponseSchema,
  SpaceParamsSchema,
} from "../schemas";

export const searchRoutes: FastifyPluginAsyncZod = async (server) => {
  server.get(
    "/spaces/:spaceId/search",
    {
      schema: {
        operationId: "searchSpace",
        summary: "Search tasks, notes and mindmap topics",
        description:
          "Matches titles and descriptions of tasks and notes, and the text of mindmap topics.",
        tags: ["Search"],
        security: [{ bearerAuth: [] }],
        params: SpaceParamsSchema,
        querystring: SearchQuerySchema,
        response: {
          200: SearchResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const user = await authenticateBearerToken(request.headers.authorization);
      if (!user) return unauthorized(reply);

      try {
        const results = await searchSpace({
          spaceId: request.params.spaceId,
          userId: user.id,
          query: request.query.q,
          limit: request.query.limit,
        });
        return reply.code(200).send({ results });
      } catch (error) {
        return sendError(request, reply, error, "Failed to search");
      }
    },
  );
};
