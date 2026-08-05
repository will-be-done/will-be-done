import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { authenticateRequest } from "../../services/authentication";
import { listSectionItems } from "../../services/items";
import {
  createSectionTask,
  deleteTask,
  getTask,
  moveTask,
  updateTask,
} from "../../services/tasks";
import { clearTaskSchedule, scheduleTask } from "../../services/scheduling";
import { listSpaceTasks } from "../../services/taskQueries";
import { listScheduledTasks } from "../../services/scheduledTasks";
import { getDMY } from "@will-be-done/slices/space";
import { sendError as handleTaskError, unauthorized } from "../errors";
import {
  SectionTasksParamsSchema,
  CreateTaskBodySchema,
  ErrorResponseSchema,
  ListSectionItemsQuerySchema,
  ListSectionItemsResponseSchema,
  ListSpaceTasksQuerySchema,
  MoveTaskBodySchema,
  PaginatedTasksResponseSchema,
  ScheduleTaskBodySchema,
  ScheduleTaskResponseSchema,
  TaskParamsSchema,
  TaskResponseSchema,
  UpdateTaskBodySchema,
  ScheduledTasksQuerySchema,
  SpaceParamsSchema,
} from "../schemas";

export const taskRoutes: FastifyPluginAsyncZod = async (server) => {
  server.get(
    "/spaces/:spaceId/tasks",
    {
      schema: {
        operationId: "listTasks",
        summary: "List tasks in a space",
        description:
          "Returns tasks ordered by creation time descending with opaque cursor pagination.",
        tags: ["Tasks"],
        security: [{ bearerAuth: [] }],
        params: SpaceParamsSchema,
        querystring: ListSpaceTasksQuerySchema,
        response: {
          200: PaginatedTasksResponseSchema,
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
        return reply.code(200).send(
          await listSpaceTasks({
            spaceId: request.params.spaceId,
            userId: user.id,
            ...request.query,
          }),
        );
      } catch (error) {
        return handleTaskError(request, reply, error, "Failed to list tasks");
      }
    },
  );

  server.get(
    "/spaces/:spaceId/scheduled-tasks",
    {
      schema: {
        operationId: "listScheduledTasks",
        summary: "List overdue or upcoming tasks",
        description:
          "Returns scheduled todo tasks ordered by schedule date. Overdue excludes relativeTo; upcoming includes it.",
        tags: ["Tasks"],
        security: [{ bearerAuth: [] }],
        params: SpaceParamsSchema,
        querystring: ScheduledTasksQuerySchema,
        response: {
          200: PaginatedTasksResponseSchema,
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
        return reply.code(200).send(
          await listScheduledTasks({
            spaceId: request.params.spaceId,
            userId: user.id,
            scope: request.query.scope,
            relativeTo: request.query.relativeTo ?? getDMY(new Date()),
            to: request.query.to,
            cursor: request.query.cursor,
            limit: request.query.limit,
          }),
        );
      } catch (error) {
        return handleTaskError(
          request,
          reply,
          error,
          "Failed to list scheduled tasks",
        );
      }
    },
  );

  server.get(
    "/spaces/:spaceId/sections/:sectionId/items",
    {
      schema: {
        operationId: "listSectionItems",
        summary: "List section items",
        description:
          "Returns todo tasks and templates in display order by default. When taskState is done, returns completed tasks only.",
        tags: ["Project sections"],
        security: [{ bearerAuth: [] }],
        params: SectionTasksParamsSchema,
        querystring: ListSectionItemsQuerySchema,
        response: {
          200: ListSectionItemsResponseSchema,
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
        const items = await listSectionItems({
          spaceId: request.params.spaceId,
          sectionId: request.params.sectionId,
          userId: user.id,
          taskState: request.query.taskState,
        });
        return reply.code(200).send({ items });
      } catch (error) {
        return handleTaskError(request, reply, error, "Failed to list items");
      }
    },
  );

  server.post(
    "/spaces/:spaceId/sections/:sectionId/tasks",
    {
      schema: {
        operationId: "createSectionTask",
        summary: "Create a task",
        tags: ["Tasks"],
        security: [{ bearerAuth: [] }],
        params: SectionTasksParamsSchema,
        body: CreateTaskBodySchema,
        response: {
          201: TaskResponseSchema,
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
        const task = await createSectionTask({
          spaceId: request.params.spaceId,
          sectionId: request.params.sectionId,
          userId: user.id,
          ...request.body,
        });
        return reply.code(201).send({ task });
      } catch (error) {
        return handleTaskError(request, reply, error, "Failed to create task");
      }
    },
  );

  server.get(
    "/spaces/:spaceId/tasks/:taskId",
    {
      schema: {
        operationId: "getTask",
        summary: "Get a task",
        tags: ["Tasks"],
        security: [{ bearerAuth: [] }],
        params: TaskParamsSchema,
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
        const task = await getTask({
          spaceId: request.params.spaceId,
          taskId: request.params.taskId,
          userId: user.id,
        });
        return reply.code(200).send({ task });
      } catch (error) {
        return handleTaskError(request, reply, error, "Failed to get task");
      }
    },
  );

  server.patch(
    "/spaces/:spaceId/tasks/:taskId",
    {
      schema: {
        operationId: "updateTask",
        summary: "Update a task",
        tags: ["Tasks"],
        security: [{ bearerAuth: [] }],
        params: TaskParamsSchema,
        body: UpdateTaskBodySchema,
        response: {
          200: TaskResponseSchema,
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
        const task = await updateTask({
          spaceId: request.params.spaceId,
          taskId: request.params.taskId,
          userId: user.id,
          updates: request.body,
        });
        return reply.code(200).send({ task });
      } catch (error) {
        return handleTaskError(request, reply, error, "Failed to update task");
      }
    },
  );

  server.delete(
    "/spaces/:spaceId/tasks/:taskId",
    {
      schema: {
        operationId: "deleteTask",
        summary: "Delete a task",
        tags: ["Tasks"],
        security: [{ bearerAuth: [] }],
        params: TaskParamsSchema,
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
        await deleteTask({
          spaceId: request.params.spaceId,
          taskId: request.params.taskId,
          userId: user.id,
        });
        return reply.code(204).send(null);
      } catch (error) {
        return handleTaskError(request, reply, error, "Failed to delete task");
      }
    },
  );

  server.delete(
    "/spaces/:spaceId/tasks/:taskId/schedule",
    {
      schema: {
        operationId: "clearTaskSchedule",
        summary: "Clear a task schedule",
        tags: ["Tasks"],
        security: [{ bearerAuth: [] }],
        params: TaskParamsSchema,
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
        await clearTaskSchedule({
          spaceId: request.params.spaceId,
          taskId: request.params.taskId,
          userId: user.id,
        });
        return reply.code(204).send(null);
      } catch (error) {
        return handleTaskError(
          request,
          reply,
          error,
          "Failed to clear task schedule",
        );
      }
    },
  );

  server.post(
    "/spaces/:spaceId/tasks/:taskId/schedule",
    {
      schema: {
        operationId: "scheduleTask",
        summary: "Schedule a task",
        description:
          "Schedules or reschedules a task on a date. Existing schedules are replaced.",
        tags: ["Tasks"],
        security: [{ bearerAuth: [] }],
        params: TaskParamsSchema,
        body: ScheduleTaskBodySchema,
        response: {
          200: ScheduleTaskResponseSchema,
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
        return reply.code(200).send(
          await scheduleTask({
            spaceId: request.params.spaceId,
            taskId: request.params.taskId,
            userId: user.id,
            ...request.body,
          }),
        );
      } catch (error) {
        return handleTaskError(
          request,
          reply,
          error,
          "Failed to schedule task",
        );
      }
    },
  );

  server.post(
    "/spaces/:spaceId/tasks/:taskId/move",
    {
      schema: {
        operationId: "moveTask",
        summary: "Move a task",
        tags: ["Tasks"],
        security: [{ bearerAuth: [] }],
        params: TaskParamsSchema,
        body: MoveTaskBodySchema,
        response: {
          200: TaskResponseSchema,
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
        const task = await moveTask({
          spaceId: request.params.spaceId,
          taskId: request.params.taskId,
          userId: user.id,
          ...request.body,
        });
        return reply.code(200).send({ task });
      } catch (error) {
        return handleTaskError(request, reply, error, "Failed to move task");
      }
    },
  );
};
