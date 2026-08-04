import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { authenticateBearerToken } from "../../services/authentication";
import {
  createStashTask,
  listStashTasks,
  putTaskInStash,
  removeTaskFromStash,
} from "../../services/stash";
import { sendError as sendStashError, unauthorized } from "../errors";
import {
  CreateStashTaskBodySchema,
  ErrorResponseSchema,
  ListStashTasksQuerySchema,
  ListStashTasksResponseSchema,
  PutStashTaskBodySchema,
  SpaceParamsSchema,
  StashTaskParamsSchema,
  TaskResponseSchema,
} from "../schemas";

export const stashRoutes: FastifyPluginAsyncZod = async (server) => {
  server.get(
    "/spaces/:spaceId/stash/tasks",
    {
      schema: {
        operationId: "listStashTasks",
        summary: "List stash tasks",
        description:
          "Returns todo tasks in stash order by default. Completed tasks are ordered by most recent completion.",
        tags: ["Stash"],
        security: [{ bearerAuth: [] }],
        params: SpaceParamsSchema,
        querystring: ListStashTasksQuerySchema,
        response: {
          200: ListStashTasksResponseSchema,
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
        const tasks = listStashTasks({
          spaceId: request.params.spaceId,
          userId: user.id,
          state: request.query.state,
        });
        return reply.code(200).send({ tasks });
      } catch (error) {
        return sendStashError(
          request,
          reply,
          error,
          "Failed to list stash tasks",
        );
      }
    },
  );

  server.post(
    "/spaces/:spaceId/stash/tasks",
    {
      schema: {
        operationId: "createStashTask",
        summary: "Create a task in the stash",
        description:
          "Creates the underlying task in the inbox and adds it to the stash.",
        tags: ["Stash"],
        security: [{ bearerAuth: [] }],
        params: SpaceParamsSchema,
        body: CreateStashTaskBodySchema,
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
      const user = authenticateBearerToken(request.headers.authorization);
      if (!user) return unauthorized(reply);

      try {
        const task = createStashTask({
          spaceId: request.params.spaceId,
          userId: user.id,
          ...request.body,
        });
        return reply.code(201).send({ task });
      } catch (error) {
        return sendStashError(
          request,
          reply,
          error,
          "Failed to create stash task",
        );
      }
    },
  );

  server.put(
    "/spaces/:spaceId/stash/tasks/:taskId",
    {
      schema: {
        operationId: "putTaskInStash",
        summary: "Add or reposition a task in the stash",
        description:
          "Adds an existing todo task to the stash or changes its stash position. The task schedule is preserved.",
        tags: ["Stash"],
        security: [{ bearerAuth: [] }],
        params: StashTaskParamsSchema,
        body: PutStashTaskBodySchema,
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
      const user = authenticateBearerToken(request.headers.authorization);
      if (!user) return unauthorized(reply);

      try {
        const task = putTaskInStash({
          spaceId: request.params.spaceId,
          taskId: request.params.taskId,
          userId: user.id,
          placement: request.body.placement,
        });
        return reply.code(200).send({ task });
      } catch (error) {
        return sendStashError(
          request,
          reply,
          error,
          "Failed to add task to stash",
        );
      }
    },
  );

  server.delete(
    "/spaces/:spaceId/stash/tasks/:taskId",
    {
      schema: {
        operationId: "removeTaskFromStash",
        summary: "Remove a task from the stash",
        description:
          "Removes the stash membership without deleting the underlying task.",
        tags: ["Stash"],
        security: [{ bearerAuth: [] }],
        params: StashTaskParamsSchema,
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
      const user = authenticateBearerToken(request.headers.authorization);
      if (!user) return unauthorized(reply);

      try {
        removeTaskFromStash({
          spaceId: request.params.spaceId,
          taskId: request.params.taskId,
          userId: user.id,
        });
        return reply.code(204).send(null);
      } catch (error) {
        return sendStashError(
          request,
          reply,
          error,
          "Failed to remove task from stash",
        );
      }
    },
  );
};
