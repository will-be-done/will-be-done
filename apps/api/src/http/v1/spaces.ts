import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { authenticateBearerToken } from "../../services/authentication";
import {
  createUserSpace,
  deleteUserSpace,
  getUserSpace,
  listUserSpaces,
  updateUserSpace,
} from "../../services/spaces";
import { sendError, unauthorized } from "../errors";
import {
  CreateSpaceBodySchema,
  CreateSpaceResponseSchema,
  DeleteSpaceParamsSchema,
  ErrorResponseSchema,
  ListSpacesResponseSchema,
  SpaceParamsSchema,
  SpaceResponseSchema,
  UpdateSpaceBodySchema,
} from "../schemas";

export const spaceRoutes: FastifyPluginAsyncZod = async (server) => {
  server.get(
    "/spaces",
    {
      schema: {
        operationId: "listSpaces",
        summary: "List spaces",
        description: "Returns the spaces belonging to the authenticated user.",
        tags: ["Spaces"],
        security: [{ bearerAuth: [] }],
        response: {
          200: ListSpacesResponseSchema,
          401: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const user = authenticateBearerToken(request.headers.authorization);

      if (!user) {
        return reply.code(401).send({
          code: "UNAUTHORIZED",
          message: "A valid bearer token is required",
        });
      }

      try {
        const spaces = listUserSpaces({ userId: user.id });
        return reply.code(200).send({ spaces });
      } catch (error) {
        request.log.error(error, "Failed to list spaces");
        return reply.code(500).send({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to list spaces",
        });
      }
    },
  );

  server.post(
    "/spaces",
    {
      schema: {
        operationId: "createSpace",
        summary: "Create a space",
        tags: ["Spaces"],
        security: [{ bearerAuth: [] }],
        body: CreateSpaceBodySchema,
        response: {
          201: CreateSpaceResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const user = authenticateBearerToken(request.headers.authorization);

      if (!user) {
        return reply.code(401).send({
          code: "UNAUTHORIZED",
          message: "A valid bearer token is required",
        });
      }

      try {
        const space = createUserSpace({
          userId: user.id,
          name: request.body.name,
        });
        return reply.code(201).send({ space });
      } catch (error) {
        request.log.error(error, "Failed to create space");
        return reply.code(500).send({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create space",
        });
      }
    },
  );

  server.get(
    "/spaces/:spaceId",
    {
      schema: {
        operationId: "getSpace",
        summary: "Get a space",
        tags: ["Spaces"],
        security: [{ bearerAuth: [] }],
        params: SpaceParamsSchema,
        response: {
          200: SpaceResponseSchema,
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
        const space = getUserSpace({
          userId: user.id,
          spaceId: request.params.spaceId,
        });
        if (!space) {
          return reply
            .code(404)
            .send({ code: "NOT_FOUND", message: "Space not found" });
        }
        return reply.code(200).send({ space });
      } catch (error) {
        return sendError(request, reply, error, "Failed to get space");
      }
    },
  );

  server.delete(
    "/spaces/:spaceId",
    {
      schema: {
        operationId: "deleteSpace",
        summary: "Delete a space",
        tags: ["Spaces"],
        security: [{ bearerAuth: [] }],
        params: DeleteSpaceParamsSchema,
        response: {
          204: z.null(),
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const user = authenticateBearerToken(request.headers.authorization);

      if (!user) {
        return reply.code(401).send({
          code: "UNAUTHORIZED",
          message: "A valid bearer token is required",
        });
      }

      try {
        const deleted = deleteUserSpace({
          userId: user.id,
          spaceId: request.params.spaceId,
        });
        if (!deleted) {
          return reply.code(404).send({
            code: "NOT_FOUND",
            message: "Space not found",
          });
        }
        return reply.code(204).send(null);
      } catch (error) {
        request.log.error(error, "Failed to delete space");
        return reply.code(500).send({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete space",
        });
      }
    },
  );

  server.patch(
    "/spaces/:spaceId",
    {
      schema: {
        operationId: "updateSpace",
        summary: "Update a space",
        tags: ["Spaces"],
        security: [{ bearerAuth: [] }],
        params: SpaceParamsSchema,
        body: UpdateSpaceBodySchema,
        response: {
          200: SpaceResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const user = authenticateBearerToken(request.headers.authorization);
      if (!user) return unauthorized(reply);

      if (request.body.name === undefined) {
        return reply.code(400).send({
          code: "BAD_REQUEST",
          message: "Space name is required",
        });
      }

      try {
        const space = updateUserSpace({
          userId: user.id,
          spaceId: request.params.spaceId,
          name: request.body.name,
        });
        if (!space) {
          return reply.code(404).send({
            code: "NOT_FOUND",
            message: "Space not found",
          });
        }
        return reply.code(200).send({ space });
      } catch (error) {
        request.log.error(error, "Failed to update space");
        return reply.code(500).send({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update space",
        });
      }
    },
  );
};
