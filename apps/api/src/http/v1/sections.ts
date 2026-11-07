import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { Effect } from "effect";
import { z } from "zod";
import { requireUser } from "../../services/authentication";
import {
  createProjectSection,
  deleteProjectSection,
  getProjectSection,
  listProjectSections,
  moveProjectSection,
  updateProjectSection,
} from "../../services/sections";
import { runRoute } from "../errors";
import {
  SectionParamsSchema,
  CreateProjectSectionBodySchema,
  ErrorResponseSchema,
  ListProjectSectionsResponseSchema,
  MoveProjectSectionBodySchema,
  ProjectSectionResponseSchema,
  ProjectSectionsParamsSchema,
  UpdateProjectSectionBodySchema,
} from "../schemas";

export const sectionRoutes: FastifyPluginAsyncZod = async (server) => {
  server.get(
    "/spaces/:spaceId/projects/:projectId/sections",
    {
      schema: {
        operationId: "listProjectSections",
        summary: "List project sections",
        description: "Returns a project's sections in display order.",
        tags: ["Project sections"],
        security: [{ bearerAuth: [] }],
        params: ProjectSectionsParamsSchema,
        response: {
          200: ListProjectSectionsResponseSchema,
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
        "Failed to list project sections",
        Effect.gen(function* () {
          const user = yield* requireUser(request);
          const sections = yield* listProjectSections({
            spaceId: request.params.spaceId,
            projectId: request.params.projectId,
            userId: user.id,
          });
          return reply.code(200).send({ sections });
        }),
      );
    },
  );

  server.post(
    "/spaces/:spaceId/projects/:projectId/sections",
    {
      schema: {
        operationId: "createProjectSection",
        summary: "Create a project section",
        tags: ["Project sections"],
        security: [{ bearerAuth: [] }],
        params: ProjectSectionsParamsSchema,
        body: CreateProjectSectionBodySchema,
        response: {
          201: ProjectSectionResponseSchema,
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
        "Failed to create project section",
        Effect.gen(function* () {
          const user = yield* requireUser(request);
          const section = yield* createProjectSection({
            spaceId: request.params.spaceId,
            projectId: request.params.projectId,
            userId: user.id,
            ...request.body,
          });
          return reply.code(201).send({ section });
        }),
      );
    },
  );

  server.get(
    "/spaces/:spaceId/sections/:sectionId",
    {
      schema: {
        operationId: "getProjectSection",
        summary: "Get a project section",
        tags: ["Project sections"],
        security: [{ bearerAuth: [] }],
        params: SectionParamsSchema,
        response: {
          200: ProjectSectionResponseSchema,
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
        "Failed to get project section",
        Effect.gen(function* () {
          const user = yield* requireUser(request);
          const section = yield* getProjectSection({
            spaceId: request.params.spaceId,
            sectionId: request.params.sectionId,
            userId: user.id,
          });
          return reply.code(200).send({ section });
        }),
      );
    },
  );

  server.patch(
    "/spaces/:spaceId/sections/:sectionId",
    {
      schema: {
        operationId: "updateProjectSection",
        summary: "Update a project section",
        tags: ["Project sections"],
        security: [{ bearerAuth: [] }],
        params: SectionParamsSchema,
        body: UpdateProjectSectionBodySchema,
        response: {
          200: ProjectSectionResponseSchema,
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
        "Failed to update project section",
        Effect.gen(function* () {
          const user = yield* requireUser(request);
          const section = yield* updateProjectSection({
            spaceId: request.params.spaceId,
            sectionId: request.params.sectionId,
            userId: user.id,
            updates: request.body,
          });
          return reply.code(200).send({ section });
        }),
      );
    },
  );

  server.delete(
    "/spaces/:spaceId/sections/:sectionId",
    {
      schema: {
        operationId: "deleteProjectSection",
        summary: "Delete a project section",
        tags: ["Project sections"],
        security: [{ bearerAuth: [] }],
        params: SectionParamsSchema,
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
        "Failed to delete project section",
        Effect.gen(function* () {
          const user = yield* requireUser(request);
          yield* deleteProjectSection({
            spaceId: request.params.spaceId,
            sectionId: request.params.sectionId,
            userId: user.id,
          });
          return reply.code(204).send(null);
        }),
      );
    },
  );

  server.post(
    "/spaces/:spaceId/sections/:sectionId/move",
    {
      schema: {
        operationId: "moveProjectSection",
        summary: "Move a project section",
        tags: ["Project sections"],
        security: [{ bearerAuth: [] }],
        params: SectionParamsSchema,
        body: MoveProjectSectionBodySchema,
        response: {
          200: ProjectSectionResponseSchema,
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
        "Failed to move project section",
        Effect.gen(function* () {
          const user = yield* requireUser(request);
          const section = yield* moveProjectSection({
            spaceId: request.params.spaceId,
            sectionId: request.params.sectionId,
            userId: user.id,
            ...request.body,
          });
          return reply.code(200).send({ section });
        }),
      );
    },
  );
};
