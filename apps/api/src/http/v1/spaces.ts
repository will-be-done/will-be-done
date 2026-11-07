import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { Effect } from "effect";
import { z } from "zod";
import { authenticateRequest } from "../../services/authentication";
import {
  createUserSpace,
  deleteUserSpace,
  getUserSpace,
  listUserSpaces,
  updateUserSpace,
} from "../../services/spaces";
import { runRoute, unauthorized } from "../errors";
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
      const user = await authenticateRequest(request);

      if (!user) {
        return reply.code(401).send({
          code: "UNAUTHORIZED",
          message: "A valid bearer token is required",
        });
      }

      return runRoute(
        request,
        reply,
        "Failed to list spaces",
        Effect.gen(function* () {
          const spaces = yield* listUserSpaces({ userId: user.id });
          return reply.code(200).send({ spaces });
        }),
      );
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
      const user = await authenticateRequest(request);

      if (!user) {
        return reply.code(401).send({
          code: "UNAUTHORIZED",
          message: "A valid bearer token is required",
        });
      }

      return runRoute(
        request,
        reply,
        "Failed to create space",
        Effect.gen(function* () {
          const space = yield* createUserSpace({
            userId: user.id,
            name: request.body.name,
          });
          return reply.code(201).send({ space });
        }),
      );
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
      const user = await authenticateRequest(request);
      if (!user) return unauthorized(reply);

      return runRoute(
        request,
        reply,
        "Failed to get space",
        Effect.gen(function* () {
          const space = yield* getUserSpace({
            userId: user.id,
            spaceId: request.params.spaceId,
          });
          if (!space) {
            return reply
              .code(404)
              .send({ code: "NOT_FOUND", message: "Space not found" });
          }
          return reply.code(200).send({ space });
        }),
      );
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
      const user = await authenticateRequest(request);

      if (!user) {
        return reply.code(401).send({
          code: "UNAUTHORIZED",
          message: "A valid bearer token is required",
        });
      }

      return runRoute(
        request,
        reply,
        "Failed to delete space",
        Effect.gen(function* () {
          const deleted = yield* deleteUserSpace({
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
        }),
      );
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
      const user = await authenticateRequest(request);
      if (!user) return unauthorized(reply);

      const { name } = request.body;
      if (name === undefined) {
        return reply.code(400).send({
          code: "BAD_REQUEST",
          message: "Space name is required",
        });
      }

      return runRoute(
        request,
        reply,
        "Failed to update space",
        Effect.gen(function* () {
          const space = yield* updateUserSpace({
            userId: user.id,
            spaceId: request.params.spaceId,
            name,
          });
          if (!space) {
            return reply.code(404).send({
              code: "NOT_FOUND",
              message: "Space not found",
            });
          }
          return reply.code(200).send({ space });
        }),
      );
    },
  );
};
