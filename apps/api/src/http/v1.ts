import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { projectRoutes } from "./v1/projects";
import { spaceRoutes } from "./v1/spaces";
import { sectionRoutes } from "./v1/sections";
import { taskRoutes } from "./v1/tasks";
import { dailyListRoutes } from "./v1/dailyLists";
import { taskTemplateRoutes } from "./v1/taskTemplates";
import { noteRoutes } from "./v1/notes";
import { checklistItemRoutes } from "./v1/checklistItems";
import { stashRoutes } from "./v1/stash";
import { mindmapRoutes } from "./v1/mindmaps";
import { getSpaceDatabase } from "../services/databaseAccess";
import { Databases } from "../services/databases";
import { dispatch } from "../services/hyperdb";
import { runRoute } from "./errors";
import { Cause, Clock, Effect } from "effect";
import { generateSpaceTasksIfDue } from "@will-be-done/slices/space";
import { getEnvConfig } from "../env";
import {
  capturePublicApiProductEvent,
  noopBackendAnalytics,
  type BackendAnalytics,
} from "../analytics";
import {
  authenticateBearerToken,
  getAuthenticatedRequestUser,
} from "../services/authentication";

interface V1RoutesOptions {
  analytics?: BackendAnalytics;
}

function getOperationId(request: {
  method: string;
  routeOptions: { schema?: unknown; url?: string };
}) {
  const operationId = (
    request.routeOptions.schema as { operationId?: unknown } | undefined
  )?.operationId;
  return typeof operationId === "string"
    ? operationId
    : `${request.method} ${request.routeOptions.url ?? "unknown"}`;
}

export const v1Routes: FastifyPluginAsyncZod<V1RoutesOptions> = async (
  server,
  { analytics = noopBackendAnalytics },
) => {
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

    if (
      request.method === "PATCH" &&
      request.routeOptions.url?.endsWith(
        "/spaces/:spaceId/task-templates/:templateId",
      )
    ) {
      return;
    }

    return runRoute(
      request,
      reply,
      "Failed to prepare space data",
      Effect.gen(function* () {
        const user = yield* authenticateBearerToken(
          request.headers.authorization,
          yield* (yield* Databases).main,
        );
        if (!user) return;
        const db = yield* getSpaceDatabase(spaceId, user.id);
        yield* dispatch(
          db,
          generateSpaceTasksIfDue({
            toDate: yield* Clock.currentTimeMillis,
            intervalMs: getEnvConfig().WBD_TASK_GENERATION_INTERVAL_MS,
            force: false,
          }),
        ).pipe(
          Effect.catchCause((cause) =>
            Effect.sync(() =>
              request.log.error(
                Cause.squash(cause),
                "Failed to generate recurring tasks",
              ),
            ),
          ),
        );
      }),
    );
  });

  server.addHook("onResponse", async (request, reply) => {
    const user = getAuthenticatedRequestUser(request);
    if (!user) return;

    const operation = getOperationId(request);
    analytics.capture({
      name: "public_api_used",
      distinctId: user.id,
      properties: {
        method: request.method,
        operation,
        status_class: `${Math.floor(reply.statusCode / 100)}xx`,
      },
    });
    capturePublicApiProductEvent(analytics, {
      distinctId: user.id,
      operation,
      statusCode: reply.statusCode,
    });
  });

  server.register(spaceRoutes);
  server.register(projectRoutes);
  server.register(sectionRoutes);
  server.register(taskRoutes, { analytics });
  server.register(dailyListRoutes);
  server.register(taskTemplateRoutes);
  server.register(noteRoutes);
  server.register(checklistItemRoutes, { analytics });
  server.register(stashRoutes);
  server.register(mindmapRoutes);
};
