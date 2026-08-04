import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { authenticateBearerToken } from "../../services/authentication";
import { DatabaseAccessDeniedError } from "../../services/databaseAccess";
import { ConflictError, ResourceNotFoundError } from "../../services/errors";
import {
  createSpaceProject,
  deleteSpaceProject,
  getSpaceProject,
  listSpaceProjects,
  moveSpaceProject,
  updateSpaceProject,
} from "../../services/projects";
import {
  CreateProjectBodySchema,
  ErrorResponseSchema,
  ListProjectsParamsSchema,
  ListProjectsResponseSchema,
  MoveProjectBodySchema,
  ProjectParamsSchema,
  ProjectResponseSchema,
  UpdateProjectBodySchema,
} from "../schemas";
import { unauthorized } from "../errors";

export const projectRoutes: FastifyPluginAsyncZod = async (server) => {
  server.get(
    "/spaces/:spaceId/projects",
    {
      schema: {
        operationId: "listProjects",
        summary: "List projects",
        description: "Returns the projects in a space in their display order.",
        tags: ["Projects"],
        security: [{ bearerAuth: [] }],
        params: ListProjectsParamsSchema,
        response: {
          200: ListProjectsResponseSchema,
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

      if (!user) {
        return reply.code(401).send({
          code: "UNAUTHORIZED",
          message: "A valid bearer token is required",
        });
      }

      try {
        const projects = listSpaceProjects({
          spaceId: request.params.spaceId,
          userId: user.id,
        });
        return reply.code(200).send({ projects });
      } catch (error) {
        if (error instanceof DatabaseAccessDeniedError) {
          return reply.code(403).send({
            code: "FORBIDDEN",
            message: "You do not have access to this space",
          });
        }

        request.log.error(error, "Failed to list projects");
        return reply.code(500).send({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to list projects",
        });
      }
    },
  );

  server.post(
    "/spaces/:spaceId/projects",
    {
      schema: {
        operationId: "createProject",
        summary: "Create a project",
        tags: ["Projects"],
        security: [{ bearerAuth: [] }],
        params: ListProjectsParamsSchema,
        body: CreateProjectBodySchema,
        response: {
          201: ProjectResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          409: ErrorResponseSchema,
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
        const project = createSpaceProject({
          spaceId: request.params.spaceId,
          userId: user.id,
          ...request.body,
        });
        return reply.code(201).send({ project });
      } catch (error) {
        return sendProjectError(
          request,
          reply,
          error,
          "Failed to create project",
        );
      }
    },
  );

  server.get(
    "/spaces/:spaceId/projects/:projectId",
    {
      schema: {
        operationId: "getProject",
        summary: "Get a project",
        tags: ["Projects"],
        security: [{ bearerAuth: [] }],
        params: ProjectParamsSchema,
        response: {
          200: ProjectResponseSchema,
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
        const project = getSpaceProject({
          spaceId: request.params.spaceId,
          projectId: request.params.projectId,
          userId: user.id,
        });
        return reply.code(200).send({ project });
      } catch (error) {
        return sendProjectError(request, reply, error, "Failed to get project");
      }
    },
  );

  server.patch(
    "/spaces/:spaceId/projects/:projectId",
    {
      schema: {
        operationId: "updateProject",
        summary: "Update a project",
        tags: ["Projects"],
        security: [{ bearerAuth: [] }],
        params: ProjectParamsSchema,
        body: UpdateProjectBodySchema,
        response: {
          200: ProjectResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema,
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
        const project = updateSpaceProject({
          spaceId: request.params.spaceId,
          projectId: request.params.projectId,
          userId: user.id,
          updates: request.body,
        });
        return reply.code(200).send({ project });
      } catch (error) {
        return sendProjectError(
          request,
          reply,
          error,
          "Failed to update project",
        );
      }
    },
  );

  server.delete(
    "/spaces/:spaceId/projects/:projectId",
    {
      schema: {
        operationId: "deleteProject",
        summary: "Delete a project",
        tags: ["Projects"],
        security: [{ bearerAuth: [] }],
        params: ProjectParamsSchema,
        response: {
          204: z.null(),
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema,
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
        deleteSpaceProject({
          spaceId: request.params.spaceId,
          projectId: request.params.projectId,
          userId: user.id,
        });
        return reply.code(204).send(null);
      } catch (error) {
        return sendProjectError(
          request,
          reply,
          error,
          "Failed to delete project",
        );
      }
    },
  );

  server.post(
    "/spaces/:spaceId/projects/:projectId/move",
    {
      schema: {
        operationId: "moveProject",
        summary: "Move a project",
        tags: ["Projects"],
        security: [{ bearerAuth: [] }],
        params: ProjectParamsSchema,
        body: MoveProjectBodySchema,
        response: {
          200: ProjectResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema,
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
        const project = moveSpaceProject({
          spaceId: request.params.spaceId,
          projectId: request.params.projectId,
          userId: user.id,
          ...request.body,
        });
        return reply.code(200).send({ project });
      } catch (error) {
        return sendProjectError(
          request,
          reply,
          error,
          "Failed to move project",
        );
      }
    },
  );
};

function sendProjectError(
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
  fallbackMessage: string,
) {
  if (error instanceof DatabaseAccessDeniedError) {
    return reply.code(403).send({
      code: "FORBIDDEN",
      message: "You do not have access to this space",
    });
  }
  if (error instanceof ResourceNotFoundError) {
    return reply.code(404).send({ code: "NOT_FOUND", message: error.message });
  }
  if (error instanceof ConflictError) {
    return reply.code(409).send({ code: "CONFLICT", message: error.message });
  }
  request.log.error(error, fallbackMessage);
  return reply.code(500).send({
    code: "INTERNAL_SERVER_ERROR",
    message: fallbackMessage,
  });
}
