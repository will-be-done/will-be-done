import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { projectRoutes } from "./v1/projects";
import { spaceRoutes } from "./v1/spaces";
import { sectionRoutes } from "./v1/sections";
import { taskRoutes } from "./v1/tasks";
import { dailyListRoutes } from "./v1/dailyLists";
import { taskTemplateRoutes } from "./v1/taskTemplates";
import { checklistItemRoutes } from "./v1/checklistItems";
import { authenticateBearerToken } from "../services/authentication";
import { generateSpaceTasksIfDue } from "../services/databaseAccess";
import { sendError } from "./errors";

export const v1Routes: FastifyPluginAsyncZod = async (server) => {
  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof Error && "validation" in error && error.validation) {
      return reply.code(400).send({
        code: "BAD_REQUEST",
        message: error.message,
      });
    }
    throw error;
  });

  server.addHook("preHandler", async (request, reply) => {
    const spaceId = (request.params as { spaceId?: unknown }).spaceId;
    if (typeof spaceId !== "string") return;

    const user = authenticateBearerToken(request.headers.authorization);
    if (!user) return;

    try {
      generateSpaceTasksIfDue({ spaceId, userId: user.id });
    } catch (error) {
      return sendError(request, reply, error, "Failed to prepare space data");
    }
  });

  server.register(spaceRoutes);
  server.register(projectRoutes);
  server.register(sectionRoutes);
  server.register(taskRoutes);
  server.register(dailyListRoutes);
  server.register(taskTemplateRoutes);
  server.register(checklistItemRoutes);
};
