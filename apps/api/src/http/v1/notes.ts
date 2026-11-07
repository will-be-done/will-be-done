import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { Effect } from "effect";
import { z } from "zod";
import { authenticateRequest } from "../../services/authentication";
import {
  convertNoteToTask,
  convertTaskToNote,
  deleteNote,
  getNote,
  moveNote,
  updateNote,
} from "../../services/notes";
import { runRoute, unauthorized } from "../errors";
import {
  ErrorResponseSchema,
  MoveNoteBodySchema,
  NoteParamsSchema,
  NoteResponseSchema,
  TaskParamsSchema,
  TaskResponseSchema,
  UpdateNoteBodySchema,
} from "../schemas";

export const noteRoutes: FastifyPluginAsyncZod = async (server) => {
  server.get(
    "/spaces/:spaceId/notes/:noteId",
    {
      schema: {
        operationId: "getNote",
        summary: "Get a note",
        tags: ["Notes"],
        security: [{ bearerAuth: [] }],
        params: NoteParamsSchema,
        response: {
          200: NoteResponseSchema,
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

      return runRoute(
        request,
        reply,
        "Failed to get note",
        Effect.gen(function* () {
          const note = yield* getNote({
            spaceId: request.params.spaceId,
            noteId: request.params.noteId,
            userId: user.id,
          });
          return reply.code(200).send({ note });
        }),
      );
    },
  );

  server.patch(
    "/spaces/:spaceId/notes/:noteId",
    {
      schema: {
        operationId: "updateNote",
        summary: "Update a note",
        tags: ["Notes"],
        security: [{ bearerAuth: [] }],
        params: NoteParamsSchema,
        body: UpdateNoteBodySchema,
        response: {
          200: NoteResponseSchema,
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

      return runRoute(
        request,
        reply,
        "Failed to update note",
        Effect.gen(function* () {
          const note = yield* updateNote({
            spaceId: request.params.spaceId,
            noteId: request.params.noteId,
            userId: user.id,
            updates: request.body,
          });
          return reply.code(200).send({ note });
        }),
      );
    },
  );

  server.delete(
    "/spaces/:spaceId/notes/:noteId",
    {
      schema: {
        operationId: "deleteNote",
        summary: "Delete a note",
        tags: ["Notes"],
        security: [{ bearerAuth: [] }],
        params: NoteParamsSchema,
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

      return runRoute(
        request,
        reply,
        "Failed to delete note",
        Effect.gen(function* () {
          yield* deleteNote({
            spaceId: request.params.spaceId,
            noteId: request.params.noteId,
            userId: user.id,
          });
          return reply.code(204).send(null);
        }),
      );
    },
  );

  server.post(
    "/spaces/:spaceId/notes/:noteId/move",
    {
      schema: {
        operationId: "moveNote",
        summary: "Move a note",
        tags: ["Notes"],
        security: [{ bearerAuth: [] }],
        params: NoteParamsSchema,
        body: MoveNoteBodySchema,
        response: {
          200: NoteResponseSchema,
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

      return runRoute(
        request,
        reply,
        "Failed to move note",
        Effect.gen(function* () {
          const note = yield* moveNote({
            spaceId: request.params.spaceId,
            noteId: request.params.noteId,
            userId: user.id,
            ...request.body,
          });
          return reply.code(200).send({ note });
        }),
      );
    },
  );

  server.post(
    "/spaces/:spaceId/tasks/:taskId/convert-to-note",
    {
      schema: {
        operationId: "convertTaskToNote",
        summary: "Convert a task to a note",
        tags: ["Notes"],
        security: [{ bearerAuth: [] }],
        params: TaskParamsSchema,
        response: {
          200: NoteResponseSchema,
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

      return runRoute(
        request,
        reply,
        "Failed to convert task to note",
        Effect.gen(function* () {
          const note = yield* convertTaskToNote({
            spaceId: request.params.spaceId,
            taskId: request.params.taskId,
            userId: user.id,
          });
          return reply.code(200).send({ note });
        }),
      );
    },
  );

  server.post(
    "/spaces/:spaceId/notes/:noteId/convert-to-task",
    {
      schema: {
        operationId: "convertNoteToTask",
        summary: "Convert a note to a task",
        tags: ["Notes"],
        security: [{ bearerAuth: [] }],
        params: NoteParamsSchema,
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

      return runRoute(
        request,
        reply,
        "Failed to convert note to task",
        Effect.gen(function* () {
          const task = yield* convertNoteToTask({
            spaceId: request.params.spaceId,
            noteId: request.params.noteId,
            userId: user.id,
          });
          return reply.code(200).send({ task });
        }),
      );
    },
  );
};
