import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { Effect } from "effect";
import { z } from "zod";
import { requireUser } from "../../services/authentication";
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
import { runRoute } from "../errors";

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
      return runRoute(
        request,
        reply,
        "Failed to list projects",
        Effect.gen(function* () {
          const user = yield* requireUser(request);
          const projects = yield* listSpaceProjects({
            spaceId: request.params.spaceId,
            userId: user.id,
          });
          return reply.code(200).send({ projects });
        }),
      );
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
      return runRoute(
        request,
        reply,
        "Failed to create project",
        Effect.gen(function* () {
          const user = yield* requireUser(request);
          const project = yield* createSpaceProject({
            spaceId: request.params.spaceId,
            userId: user.id,
            ...request.body,
          });
          return reply.code(201).send({ project });
        }),
      );
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
      return runRoute(
        request,
        reply,
        "Failed to get project",
        Effect.gen(function* () {
          const user = yield* requireUser(request);
          const project = yield* getSpaceProject({
            spaceId: request.params.spaceId,
            projectId: request.params.projectId,
            userId: user.id,
          });
          return reply.code(200).send({ project });
        }),
      );
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
      return runRoute(
        request,
        reply,
        "Failed to update project",
        Effect.gen(function* () {
          const user = yield* requireUser(request);
          const project = yield* updateSpaceProject({
            spaceId: request.params.spaceId,
            projectId: request.params.projectId,
            userId: user.id,
            updates: request.body,
          });
          return reply.code(200).send({ project });
        }),
      );
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
      return runRoute(
        request,
        reply,
        "Failed to delete project",
        Effect.gen(function* () {
          const user = yield* requireUser(request);
          yield* deleteSpaceProject({
            spaceId: request.params.spaceId,
            projectId: request.params.projectId,
            userId: user.id,
          });
          return reply.code(204).send(null);
        }),
      );
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
      return runRoute(
        request,
        reply,
        "Failed to move project",
        Effect.gen(function* () {
          const user = yield* requireUser(request);
          const project = yield* moveSpaceProject({
            spaceId: request.params.spaceId,
            projectId: request.params.projectId,
            userId: user.id,
            ...request.body,
          });
          return reply.code(200).send({ project });
        }),
      );
    },
  );
};
