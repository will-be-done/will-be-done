import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { authenticateRequest } from "../../services/authentication";
import {
  createChecklistItem,
  deleteChecklistItem,
  getChecklistItem,
  listChecklistItems,
  moveChecklistItem,
  updateChecklistItem,
} from "../../services/checklistItems";
import { sendError as handleError, unauthorized } from "../errors";
import {
  ChecklistItemParamsSchema,
  ChecklistItemResponseSchema,
  ChecklistItemsResponseSchema,
  CreateChecklistItemBodySchema,
  ErrorResponseSchema,
  MoveChecklistItemBodySchema,
  TaskChecklistParamsSchema,
  TaskTemplateChecklistParamsSchema,
  UpdateChecklistItemBodySchema,
} from "../schemas";

export const checklistItemRoutes: FastifyPluginAsyncZod = async (server) => {
  server.get(
    "/spaces/:spaceId/tasks/:taskId/checklist-items",
    {
      schema: {
        operationId: "listTaskChecklistItems",
        summary: "List a task's checklist items",
        tags: ["Checklist items"],
        security: [{ bearerAuth: [] }],
        params: TaskChecklistParamsSchema,
        response: {
          200: ChecklistItemsResponseSchema,
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
        const checklistItems = await listChecklistItems({
          spaceId: request.params.spaceId,
          userId: user.id,
          parentType: "task",
          parentId: request.params.taskId,
        });
        return reply.code(200).send({ checklistItems });
      } catch (error) {
        return handleError(
          request,
          reply,
          error,
          "Failed to list checklist items",
        );
      }
    },
  );

  server.post(
    "/spaces/:spaceId/tasks/:taskId/checklist-items",
    {
      schema: {
        operationId: "createTaskChecklistItem",
        summary: "Create a checklist item for a task",
        tags: ["Checklist items"],
        security: [{ bearerAuth: [] }],
        params: TaskChecklistParamsSchema,
        body: CreateChecklistItemBodySchema,
        response: {
          201: ChecklistItemResponseSchema,
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
        const checklistItem = await createChecklistItem({
          spaceId: request.params.spaceId,
          userId: user.id,
          parentType: "task",
          parentId: request.params.taskId,
          ...request.body,
        });
        return reply.code(201).send({ checklistItem });
      } catch (error) {
        return handleError(
          request,
          reply,
          error,
          "Failed to create checklist item",
        );
      }
    },
  );

  server.get(
    "/spaces/:spaceId/task-templates/:templateId/checklist-items",
    {
      schema: {
        operationId: "listTaskTemplateChecklistItems",
        summary: "List a task template's checklist items",
        tags: ["Checklist items"],
        security: [{ bearerAuth: [] }],
        params: TaskTemplateChecklistParamsSchema,
        response: {
          200: ChecklistItemsResponseSchema,
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
        const checklistItems = await listChecklistItems({
          spaceId: request.params.spaceId,
          userId: user.id,
          parentType: "template",
          parentId: request.params.templateId,
        });
        return reply.code(200).send({ checklistItems });
      } catch (error) {
        return handleError(
          request,
          reply,
          error,
          "Failed to list checklist items",
        );
      }
    },
  );

  server.post(
    "/spaces/:spaceId/task-templates/:templateId/checklist-items",
    {
      schema: {
        operationId: "createTaskTemplateChecklistItem",
        summary: "Create a checklist item for a task template",
        tags: ["Checklist items"],
        security: [{ bearerAuth: [] }],
        params: TaskTemplateChecklistParamsSchema,
        body: CreateChecklistItemBodySchema,
        response: {
          201: ChecklistItemResponseSchema,
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
        const checklistItem = await createChecklistItem({
          spaceId: request.params.spaceId,
          userId: user.id,
          parentType: "template",
          parentId: request.params.templateId,
          ...request.body,
        });
        return reply.code(201).send({ checklistItem });
      } catch (error) {
        return handleError(
          request,
          reply,
          error,
          "Failed to create checklist item",
        );
      }
    },
  );

  server.get(
    "/spaces/:spaceId/checklist-items/:checklistItemId",
    {
      schema: {
        operationId: "getChecklistItem",
        summary: "Get a checklist item",
        tags: ["Checklist items"],
        security: [{ bearerAuth: [] }],
        params: ChecklistItemParamsSchema,
        response: {
          200: ChecklistItemResponseSchema,
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
        const checklistItem = await getChecklistItem({
          spaceId: request.params.spaceId,
          userId: user.id,
          checklistItemId: request.params.checklistItemId,
        });
        return reply.code(200).send({ checklistItem });
      } catch (error) {
        return handleError(
          request,
          reply,
          error,
          "Failed to get checklist item",
        );
      }
    },
  );

  server.patch(
    "/spaces/:spaceId/checklist-items/:checklistItemId",
    {
      schema: {
        operationId: "updateChecklistItem",
        summary: "Update a checklist item",
        tags: ["Checklist items"],
        security: [{ bearerAuth: [] }],
        params: ChecklistItemParamsSchema,
        body: UpdateChecklistItemBodySchema,
        response: {
          200: ChecklistItemResponseSchema,
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
        const checklistItem = await updateChecklistItem({
          spaceId: request.params.spaceId,
          userId: user.id,
          checklistItemId: request.params.checklistItemId,
          updates: request.body,
        });
        return reply.code(200).send({ checklistItem });
      } catch (error) {
        return handleError(
          request,
          reply,
          error,
          "Failed to update checklist item",
        );
      }
    },
  );

  server.delete(
    "/spaces/:spaceId/checklist-items/:checklistItemId",
    {
      schema: {
        operationId: "deleteChecklistItem",
        summary: "Delete a checklist item",
        tags: ["Checklist items"],
        security: [{ bearerAuth: [] }],
        params: ChecklistItemParamsSchema,
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
        await deleteChecklistItem({
          spaceId: request.params.spaceId,
          userId: user.id,
          checklistItemId: request.params.checklistItemId,
        });
        return reply.code(204).send(null);
      } catch (error) {
        return handleError(
          request,
          reply,
          error,
          "Failed to delete checklist item",
        );
      }
    },
  );

  server.post(
    "/spaces/:spaceId/checklist-items/:checklistItemId/move",
    {
      schema: {
        operationId: "moveChecklistItem",
        summary: "Move a checklist item",
        tags: ["Checklist items"],
        security: [{ bearerAuth: [] }],
        params: ChecklistItemParamsSchema,
        body: MoveChecklistItemBodySchema,
        response: {
          200: ChecklistItemResponseSchema,
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
        const checklistItem = await moveChecklistItem({
          spaceId: request.params.spaceId,
          userId: user.id,
          checklistItemId: request.params.checklistItemId,
          ...request.body,
        });
        return reply.code(200).send({ checklistItem });
      } catch (error) {
        return handleError(
          request,
          reply,
          error,
          "Failed to move checklist item",
        );
      }
    },
  );
};
