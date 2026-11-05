import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { authenticateBearerToken } from "../../services/authentication";
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
import { sendError, unauthorized } from "../errors";
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
      const user = await authenticateBearerToken(request.headers.authorization);
      if (!user) return unauthorized(reply);

      try {
        const mindmaps = await listMindmaps({
          spaceId: request.params.spaceId,
          userId: user.id,
        });
        return reply.code(200).send({ mindmaps });
      } catch (error) {
        return sendError(request, reply, error, "Failed to list mindmaps");
      }
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
      const user = await authenticateBearerToken(request.headers.authorization);
      if (!user) return unauthorized(reply);

      try {
        const mindmap = await createMindmap({
          spaceId: request.params.spaceId,
          userId: user.id,
          title: request.body.title,
        });
        return reply.code(201).send({ mindmap });
      } catch (error) {
        return sendError(request, reply, error, "Failed to create mindmap");
      }
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
      const user = await authenticateBearerToken(request.headers.authorization);
      if (!user) return unauthorized(reply);

      try {
        const result = await getMindmap({
          spaceId: request.params.spaceId,
          userId: user.id,
          mindmapId: request.params.mindmapId,
        });
        return reply.code(200).send(result);
      } catch (error) {
        return sendError(request, reply, error, "Failed to get mindmap");
      }
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
      const user = await authenticateBearerToken(request.headers.authorization);
      if (!user) return unauthorized(reply);

      try {
        const mindmap = await updateMindmap({
          spaceId: request.params.spaceId,
          userId: user.id,
          mindmapId: request.params.mindmapId,
          title: request.body.title,
        });
        return reply.code(200).send({ mindmap });
      } catch (error) {
        return sendError(request, reply, error, "Failed to update mindmap");
      }
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
      const user = await authenticateBearerToken(request.headers.authorization);
      if (!user) return unauthorized(reply);

      try {
        await deleteMindmap({
          spaceId: request.params.spaceId,
          userId: user.id,
          mindmapId: request.params.mindmapId,
        });
        return reply.code(204).send(null);
      } catch (error) {
        return sendError(request, reply, error, "Failed to delete mindmap");
      }
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
      const user = await authenticateBearerToken(request.headers.authorization);
      if (!user) return unauthorized(reply);

      try {
        const node = await createMindmapNode({
          spaceId: request.params.spaceId,
          userId: user.id,
          mindmapId: request.params.mindmapId,
          ...request.body,
        });
        return reply.code(201).send({ node });
      } catch (error) {
        return sendError(request, reply, error, "Failed to add mindmap node");
      }
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
      const user = await authenticateBearerToken(request.headers.authorization);
      if (!user) return unauthorized(reply);

      try {
        const node = await updateMindmapNode({
          spaceId: request.params.spaceId,
          userId: user.id,
          nodeId: request.params.nodeId,
          ...request.body,
        });
        return reply.code(200).send({ node });
      } catch (error) {
        return sendError(
          request,
          reply,
          error,
          "Failed to update mindmap node",
        );
      }
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
      const user = await authenticateBearerToken(request.headers.authorization);
      if (!user) return unauthorized(reply);

      try {
        const node = await moveMindmapNode({
          spaceId: request.params.spaceId,
          userId: user.id,
          nodeId: request.params.nodeId,
          ...request.body,
        });
        return reply.code(200).send({ node });
      } catch (error) {
        return sendError(request, reply, error, "Failed to move mindmap node");
      }
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
      const user = await authenticateBearerToken(request.headers.authorization);
      if (!user) return unauthorized(reply);

      try {
        await deleteMindmapNode({
          spaceId: request.params.spaceId,
          userId: user.id,
          nodeId: request.params.nodeId,
        });
        return reply.code(204).send(null);
      } catch (error) {
        return sendError(
          request,
          reply,
          error,
          "Failed to remove mindmap node",
        );
      }
    },
  );
};
