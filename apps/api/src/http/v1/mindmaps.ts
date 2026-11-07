import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { Effect } from "effect";
import { z } from "zod";
import { requireUser } from "../../services/authentication";
import {
  createMindmap,
  createMindmapNode,
  deleteMindmap,
  deleteMindmapNode,
  getMindmap,
  listMindmaps,
  moveMindmapNode,
  updateMindmap,
  updateMindmapNode,
} from "../../services/mindmaps";
import { runRoute } from "../errors";
import {
  CreateMindmapBodySchema,
  CreateMindmapNodeBodySchema,
  ErrorResponseSchema,
  MindmapNodeParamsSchema,
  MindmapNodeResponseSchema,
  MindmapParamsSchema,
  MindmapResponseSchema,
  MindmapsResponseSchema,
  MindmapWithNodesResponseSchema,
  MoveMindmapNodeBodySchema,
  SpaceParamsSchema,
  UpdateMindmapBodySchema,
  UpdateMindmapNodeBodySchema,
} from "../schemas";

const errorResponses = {
  400: ErrorResponseSchema,
  401: ErrorResponseSchema,
  403: ErrorResponseSchema,
  404: ErrorResponseSchema,
  409: ErrorResponseSchema,
  500: ErrorResponseSchema,
};

const common = {
  tags: ["Mindmaps"],
  security: [{ bearerAuth: [] }],
};

export const mindmapRoutes: FastifyPluginAsyncZod = async (server) => {
  server.get(
    "/spaces/:spaceId/mindmaps",
    {
      schema: {
        ...common,
        operationId: "listMindmaps",
        summary: "List mindmaps",
        params: SpaceParamsSchema,
        response: { 200: MindmapsResponseSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      return runRoute(
        request,
        reply,
        "Failed to list mindmaps",
        Effect.gen(function* () {
          const user = yield* requireUser(request);
          const mindmaps = yield* listMindmaps({
            spaceId: request.params.spaceId,
            userId: user.id,
          });
          return reply.code(200).send({ mindmaps });
        }),
      );
    },
  );

  server.post(
    "/spaces/:spaceId/mindmaps",
    {
      schema: {
        ...common,
        operationId: "createMindmap",
        summary: "Create a mindmap",
        params: SpaceParamsSchema,
        body: CreateMindmapBodySchema,
        response: { 201: MindmapResponseSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      return runRoute(
        request,
        reply,
        "Failed to create mindmap",
        Effect.gen(function* () {
          const user = yield* requireUser(request);
          const mindmap = yield* createMindmap({
            spaceId: request.params.spaceId,
            userId: user.id,
            title: request.body.title,
          });
          return reply.code(201).send({ mindmap });
        }),
      );
    },
  );

  server.get(
    "/spaces/:spaceId/mindmaps/:mindmapId",
    {
      schema: {
        ...common,
        operationId: "getMindmap",
        summary: "Get a mindmap with its nodes",
        params: MindmapParamsSchema,
        response: { 200: MindmapWithNodesResponseSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      return runRoute(
        request,
        reply,
        "Failed to get mindmap",
        Effect.gen(function* () {
          const user = yield* requireUser(request);
          const result = yield* getMindmap({
            spaceId: request.params.spaceId,
            userId: user.id,
            mindmapId: request.params.mindmapId,
          });
          return reply.code(200).send(result);
        }),
      );
    },
  );

  server.patch(
    "/spaces/:spaceId/mindmaps/:mindmapId",
    {
      schema: {
        ...common,
        operationId: "updateMindmap",
        summary: "Rename a mindmap",
        params: MindmapParamsSchema,
        body: UpdateMindmapBodySchema,
        response: { 200: MindmapResponseSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      return runRoute(
        request,
        reply,
        "Failed to update mindmap",
        Effect.gen(function* () {
          const user = yield* requireUser(request);
          const mindmap = yield* updateMindmap({
            spaceId: request.params.spaceId,
            userId: user.id,
            mindmapId: request.params.mindmapId,
            title: request.body.title,
          });
          return reply.code(200).send({ mindmap });
        }),
      );
    },
  );

  server.delete(
    "/spaces/:spaceId/mindmaps/:mindmapId",
    {
      schema: {
        ...common,
        operationId: "deleteMindmap",
        summary: "Delete a mindmap",
        description:
          "Deletes the mindmap and its nodes. Tasks on it stay in their projects.",
        params: MindmapParamsSchema,
        response: { 204: z.null(), ...errorResponses },
      },
    },
    async (request, reply) => {
      return runRoute(
        request,
        reply,
        "Failed to delete mindmap",
        Effect.gen(function* () {
          const user = yield* requireUser(request);
          yield* deleteMindmap({
            spaceId: request.params.spaceId,
            userId: user.id,
            mindmapId: request.params.mindmapId,
          });
          return reply.code(204).send(null);
        }),
      );
    },
  );

  server.post(
    "/spaces/:spaceId/mindmaps/:mindmapId/nodes",
    {
      schema: {
        ...common,
        operationId: "createMindmapNode",
        summary: "Add a topic, task, or note to a mindmap",
        params: MindmapParamsSchema,
        body: CreateMindmapNodeBodySchema,
        response: { 201: MindmapNodeResponseSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      return runRoute(
        request,
        reply,
        "Failed to add mindmap node",
        Effect.gen(function* () {
          const user = yield* requireUser(request);
          const node = yield* createMindmapNode({
            spaceId: request.params.spaceId,
            userId: user.id,
            mindmapId: request.params.mindmapId,
            ...request.body,
          });
          return reply.code(201).send({ node });
        }),
      );
    },
  );

  server.patch(
    "/spaces/:spaceId/mindmap-nodes/:nodeId",
    {
      schema: {
        ...common,
        operationId: "updateMindmapNode",
        summary: "Update a mindmap node",
        params: MindmapNodeParamsSchema,
        body: UpdateMindmapNodeBodySchema,
        response: { 200: MindmapNodeResponseSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      return runRoute(
        request,
        reply,
        "Failed to update mindmap node",
        Effect.gen(function* () {
          const user = yield* requireUser(request);
          const node = yield* updateMindmapNode({
            spaceId: request.params.spaceId,
            userId: user.id,
            nodeId: request.params.nodeId,
            ...request.body,
          });
          return reply.code(200).send({ node });
        }),
      );
    },
  );

  server.post(
    "/spaces/:spaceId/mindmap-nodes/:nodeId/move",
    {
      schema: {
        ...common,
        operationId: "moveMindmapNode",
        summary: "Move a mindmap node and its subtree",
        params: MindmapNodeParamsSchema,
        body: MoveMindmapNodeBodySchema,
        response: { 200: MindmapNodeResponseSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      return runRoute(
        request,
        reply,
        "Failed to move mindmap node",
        Effect.gen(function* () {
          const user = yield* requireUser(request);
          const node = yield* moveMindmapNode({
            spaceId: request.params.spaceId,
            userId: user.id,
            nodeId: request.params.nodeId,
            ...request.body,
          });
          return reply.code(200).send({ node });
        }),
      );
    },
  );

  server.delete(
    "/spaces/:spaceId/mindmap-nodes/:nodeId",
    {
      schema: {
        ...common,
        operationId: "deleteMindmapNode",
        summary: "Remove a node and its subtree from a mindmap",
        description: "Tasks on the removed nodes stay in their projects.",
        params: MindmapNodeParamsSchema,
        response: { 204: z.null(), ...errorResponses },
      },
    },
    async (request, reply) => {
      return runRoute(
        request,
        reply,
        "Failed to remove mindmap node",
        Effect.gen(function* () {
          const user = yield* requireUser(request);
          yield* deleteMindmapNode({
            spaceId: request.params.spaceId,
            userId: user.id,
            nodeId: request.params.nodeId,
          });
          return reply.code(204).send(null);
        }),
      );
    },
  );
};
