import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { DailyReportRating } from "@will-be-done/slices/space";
import { authenticateRequest } from "../../services/authentication";
import {
  getDailyReport,
  listDailyReportsInRange,
  putDailyReport,
  removeDailyReport,
} from "../../services/dailyReports";
import { sendError, unauthorized } from "../errors";
import {
  DailyReportParamsSchema,
  DailyReportResponseSchema,
  DailyReportsRangeQuerySchema,
  DailyReportsRangeResponseSchema,
  ErrorResponseSchema,
  SpaceParamsSchema,
  UpsertDailyReportBodySchema,
} from "../schemas";

export const dailyReportRoutes: FastifyPluginAsyncZod = async (server) => {
  server.get(
    "/spaces/:spaceId/daily-reports",
    {
      schema: {
        operationId: "listDailyReports",
        summary: "List daily reports in a date range",
        description:
          "Returns existing daily reports in descending date order. Empty dates are omitted.",
        tags: ["Daily reports"],
        security: [{ bearerAuth: [] }],
        params: SpaceParamsSchema,
        querystring: DailyReportsRangeQuerySchema,
        response: {
          200: DailyReportsRangeResponseSchema,
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
        const result = await listDailyReportsInRange({
          spaceId: request.params.spaceId,
          userId: user.id,
          ...request.query,
        });
        return reply.code(200).send(result);
      } catch (error) {
        return sendError(request, reply, error, "Failed to list daily reports");
      }
    },
  );

  server.get(
    "/spaces/:spaceId/daily-reports/:date",
    {
      schema: {
        operationId: "getDailyReport",
        summary: "Get a daily report",
        description: "Returns the daily report for a date, if one exists.",
        tags: ["Daily reports"],
        security: [{ bearerAuth: [] }],
        params: DailyReportParamsSchema,
        response: {
          200: DailyReportResponseSchema,
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
        const dailyReport = await getDailyReport({
          spaceId: request.params.spaceId,
          userId: user.id,
          date: request.params.date,
        });
        return reply.code(200).send({ dailyReport });
      } catch (error) {
        return sendError(request, reply, error, "Failed to get daily report");
      }
    },
  );

  server.put(
    "/spaces/:spaceId/daily-reports/:date",
    {
      schema: {
        operationId: "putDailyReport",
        summary: "Create or update a daily report",
        description:
          "Creates the report for a date if it does not exist, or updates the existing one. Omitted completed tasks are snapshotted from that day's done scheduled tasks on create.",
        tags: ["Daily reports"],
        security: [{ bearerAuth: [] }],
        params: DailyReportParamsSchema,
        body: UpsertDailyReportBodySchema,
        response: {
          200: DailyReportResponseSchema,
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
        const dailyReport = await putDailyReport({
          spaceId: request.params.spaceId,
          userId: user.id,
          date: request.params.date,
          notes: request.body.notes,
          completedTasks: request.body.completedTasks,
          mood: request.body.mood as DailyReportRating | null | undefined,
          energy: request.body.energy as DailyReportRating | null | undefined,
          focus: request.body.focus as DailyReportRating | null | undefined,
          accomplishment: request.body.accomplishment as
            | DailyReportRating
            | null
            | undefined,
        });
        return reply.code(200).send({ dailyReport });
      } catch (error) {
        return sendError(request, reply, error, "Failed to save daily report");
      }
    },
  );

  server.delete(
    "/spaces/:spaceId/daily-reports/:date",
    {
      schema: {
        operationId: "deleteDailyReport",
        summary: "Delete a daily report",
        description: "Deletes the daily report for a date.",
        tags: ["Daily reports"],
        security: [{ bearerAuth: [] }],
        params: DailyReportParamsSchema,
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
        await removeDailyReport({
          spaceId: request.params.spaceId,
          userId: user.id,
          date: request.params.date,
        });
        return reply.code(204).send(null);
      } catch (error) {
        return sendError(
          request,
          reply,
          error,
          "Failed to delete daily report",
        );
      }
    },
  );
};
