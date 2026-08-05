import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { asyncDispatch } from "@will-be-done/hyperdb";
import { generateTasksForTemplate } from "@will-be-done/slices/space";
import { authenticateRequest } from "../../services/authentication";
import {
  convertTaskTemplateToTask,
  convertTaskToTemplate,
  createSectionTaskTemplate,
  deleteTaskTemplate,
  getTaskTemplate,
  moveTaskTemplate,
  updateTaskTemplate,
} from "../../services/taskTemplates";
import { getSpaceDatabase } from "../../services/databaseAccess";
import { sendError as handleError, unauthorized } from "../errors";
import {
  ConvertTaskToTemplateBodySchema,
  CreateTaskTemplateBodySchema,
  ErrorResponseSchema,
  MoveTaskTemplateBodySchema,
  SectionTasksParamsSchema,
  TaskParamsSchema,
  TaskResponseSchema,
  TaskTemplateParamsSchema,
  TaskTemplateResponseSchema,
  UpdateTaskTemplateBodySchema,
} from "../schemas";

export const taskTemplateRoutes: FastifyPluginAsyncZod = async (server) => {
  server.post(
    "/spaces/:spaceId/sections/:sectionId/task-templates",
    {
      schema: {
        operationId: "createTaskTemplate",
        summary: "Create a task template",
        tags: ["Task templates"],
        security: [{ bearerAuth: [] }],
        params: SectionTasksParamsSchema,
        body: CreateTaskTemplateBodySchema,
        response: {
          201: TaskTemplateResponseSchema,
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
      const user = await authenticateRequest(request);
      if (!user) return unauthorized(reply);

      try {
        const template = await createSectionTaskTemplate({
          spaceId: request.params.spaceId,
          sectionId: request.params.sectionId,
          userId: user.id,
          ...request.body,
        });
        try {
          await asyncDispatch(
            await getSpaceDatabase(request.params.spaceId, user.id),
            generateTasksForTemplate({
              templateId: template.id,
              toDate: Date.now(),
            }),
          );
        } catch (error) {
          request.log.error(error, "Failed to generate recurring tasks");
        }
        return reply.code(201).send({ template });
      } catch (error) {
        return handleError(
          request,
          reply,
          error,
          "Failed to create task template",
        );
      }
    },
  );

  server.get(
    "/spaces/:spaceId/task-templates/:templateId",
    {
      schema: {
        operationId: "getTaskTemplate",
        summary: "Get a task template",
        tags: ["Task templates"],
        security: [{ bearerAuth: [] }],
        params: TaskTemplateParamsSchema,
        response: {
          200: TaskTemplateResponseSchema,
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

      try {
        const template = await getTaskTemplate({
          spaceId: request.params.spaceId,
          templateId: request.params.templateId,
          userId: user.id,
        });
        return reply.code(200).send({ template });
      } catch (error) {
        return handleError(
          request,
          reply,
          error,
          "Failed to get task template",
        );
      }
    },
  );

  server.patch(
    "/spaces/:spaceId/task-templates/:templateId",
    {
      schema: {
        operationId: "updateTaskTemplate",
        summary: "Update a task template",
        tags: ["Task templates"],
        security: [{ bearerAuth: [] }],
        params: TaskTemplateParamsSchema,
        body: UpdateTaskTemplateBodySchema,
        response: {
          200: TaskTemplateResponseSchema,
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

      try {
        const template = await updateTaskTemplate({
          spaceId: request.params.spaceId,
          templateId: request.params.templateId,
          userId: user.id,
          updates: request.body,
        });
        try {
          await asyncDispatch(
            await getSpaceDatabase(request.params.spaceId, user.id),
            generateTasksForTemplate({
              templateId: template.id,
              toDate: Date.now(),
            }),
          );
        } catch (error) {
          request.log.error(error, "Failed to generate recurring tasks");
        }
        return reply.code(200).send({ template });
      } catch (error) {
        return handleError(
          request,
          reply,
          error,
          "Failed to update task template",
        );
      }
    },
  );

  server.delete(
    "/spaces/:spaceId/task-templates/:templateId",
    {
      schema: {
        operationId: "deleteTaskTemplate",
        summary: "Delete a task template",
        tags: ["Task templates"],
        security: [{ bearerAuth: [] }],
        params: TaskTemplateParamsSchema,
        response: {
          204: z.null(),
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

      try {
        await deleteTaskTemplate({
          spaceId: request.params.spaceId,
          templateId: request.params.templateId,
          userId: user.id,
        });
        return reply.code(204).send(null);
      } catch (error) {
        return handleError(
          request,
          reply,
          error,
          "Failed to delete task template",
        );
      }
    },
  );

  server.post(
    "/spaces/:spaceId/task-templates/:templateId/move",
    {
      schema: {
        operationId: "moveTaskTemplate",
        summary: "Move a task template",
        tags: ["Task templates"],
        security: [{ bearerAuth: [] }],
        params: TaskTemplateParamsSchema,
        body: MoveTaskTemplateBodySchema,
        response: {
          200: TaskTemplateResponseSchema,
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
      const user = await authenticateRequest(request);
      if (!user) return unauthorized(reply);

      try {
        const template = await moveTaskTemplate({
          spaceId: request.params.spaceId,
          templateId: request.params.templateId,
          userId: user.id,
          ...request.body,
        });
        return reply.code(200).send({ template });
      } catch (error) {
        return handleError(
          request,
          reply,
          error,
          "Failed to move task template",
        );
      }
    },
  );

  server.post(
    "/spaces/:spaceId/tasks/:taskId/convert-to-template",
    {
      schema: {
        operationId: "convertTaskToTemplate",
        summary: "Convert a task to a recurring template",
        tags: ["Task templates"],
        security: [{ bearerAuth: [] }],
        params: TaskParamsSchema,
        body: ConvertTaskToTemplateBodySchema,
        response: {
          200: TaskTemplateResponseSchema,
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

      try {
        const template = await convertTaskToTemplate({
          spaceId: request.params.spaceId,
          taskId: request.params.taskId,
          userId: user.id,
          updates: request.body,
        });
        return reply.code(200).send({ template });
      } catch (error) {
        return handleError(
          request,
          reply,
          error,
          "Failed to convert task to template",
        );
      }
    },
  );

  server.post(
    "/spaces/:spaceId/task-templates/:templateId/convert-to-task",
    {
      schema: {
        operationId: "convertTaskTemplateToTask",
        summary: "Convert a task template to a task",
        tags: ["Task templates"],
        security: [{ bearerAuth: [] }],
        params: TaskTemplateParamsSchema,
        response: {
          200: TaskResponseSchema,
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

      try {
        const task = await convertTaskTemplateToTask({
          spaceId: request.params.spaceId,
          templateId: request.params.templateId,
          userId: user.id,
        });
        return reply.code(200).send({ task });
      } catch (error) {
        return handleError(
          request,
          reply,
          error,
          "Failed to convert task template to task",
        );
      }
    },
  );
};
