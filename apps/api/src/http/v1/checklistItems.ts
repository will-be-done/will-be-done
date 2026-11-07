import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { Effect } from "effect";
import { z } from "zod";
import { requireUser } from "../../services/authentication";
import {
  createChecklistItem,
  deleteChecklistItem,
  getChecklistItem,
  listChecklistItems,
  moveChecklistItem,
  updateChecklistItem,
} from "../../services/checklistItems";
import { runRoute } from "../errors";
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
import { noopBackendAnalytics, type BackendAnalytics } from "../../analytics";

interface ChecklistItemRoutesOptions {
  analytics?: BackendAnalytics;
}

export const checklistItemRoutes: FastifyPluginAsyncZod<
  ChecklistItemRoutesOptions
> = async (server, { analytics = noopBackendAnalytics }) => {
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
      return runRoute(
        request,
        reply,
        "Failed to list checklist items",
        Effect.gen(function* () {
          const user = yield* requireUser(request);
          const checklistItems = yield* listChecklistItems({
            spaceId: request.params.spaceId,
            userId: user.id,
            parentType: "task",
            parentId: request.params.taskId,
          });
          return reply.code(200).send({ checklistItems });
        }),
      );
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
      return runRoute(
        request,
        reply,
        "Failed to create checklist item",
        Effect.gen(function* () {
          const user = yield* requireUser(request);
          const checklistItem = yield* createChecklistItem({
            spaceId: request.params.spaceId,
            userId: user.id,
            parentType: "task",
            parentId: request.params.taskId,
            ...request.body,
          });
          return reply.code(201).send({ checklistItem });
        }),
      );
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
      return runRoute(
        request,
        reply,
        "Failed to list checklist items",
        Effect.gen(function* () {
          const user = yield* requireUser(request);
          const checklistItems = yield* listChecklistItems({
            spaceId: request.params.spaceId,
            userId: user.id,
            parentType: "template",
            parentId: request.params.templateId,
          });
          return reply.code(200).send({ checklistItems });
        }),
      );
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
      return runRoute(
        request,
        reply,
        "Failed to create checklist item",
        Effect.gen(function* () {
          const user = yield* requireUser(request);
          const checklistItem = yield* createChecklistItem({
            spaceId: request.params.spaceId,
            userId: user.id,
            parentType: "template",
            parentId: request.params.templateId,
            ...request.body,
          });
          return reply.code(201).send({ checklistItem });
        }),
      );
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
      return runRoute(
        request,
        reply,
        "Failed to get checklist item",
        Effect.gen(function* () {
          const user = yield* requireUser(request);
          const checklistItem = yield* getChecklistItem({
            spaceId: request.params.spaceId,
            userId: user.id,
            checklistItemId: request.params.checklistItemId,
          });
          return reply.code(200).send({ checklistItem });
        }),
      );
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
      return runRoute(
        request,
        reply,
        "Failed to update checklist item",
        Effect.gen(function* () {
          const user = yield* requireUser(request);
          const previous = yield* getChecklistItem({
            spaceId: request.params.spaceId,
            userId: user.id,
            checklistItemId: request.params.checklistItemId,
          });
          const checklistItem = yield* updateChecklistItem({
            spaceId: request.params.spaceId,
            userId: user.id,
            checklistItemId: request.params.checklistItemId,
            updates: request.body,
          });
          if (previous.state === "todo" && checklistItem.state === "done") {
            analytics.capture({
              name: "checklist_item_completed",
              distinctId: user.id,
              properties: {
                completion_method: "api",
                parent_type: checklistItem.parentType,
              },
            });
          }
          return reply.code(200).send({ checklistItem });
        }),
      );
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
      return runRoute(
        request,
        reply,
        "Failed to delete checklist item",
        Effect.gen(function* () {
          const user = yield* requireUser(request);
          yield* deleteChecklistItem({
            spaceId: request.params.spaceId,
            userId: user.id,
            checklistItemId: request.params.checklistItemId,
          });
          return reply.code(204).send(null);
        }),
      );
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
      return runRoute(
        request,
        reply,
        "Failed to move checklist item",
        Effect.gen(function* () {
          const user = yield* requireUser(request);
          const checklistItem = yield* moveChecklistItem({
            spaceId: request.params.spaceId,
            userId: user.id,
            checklistItemId: request.params.checklistItemId,
            ...request.body,
          });
          return reply.code(200).send({ checklistItem });
        }),
      );
    },
  );
};
