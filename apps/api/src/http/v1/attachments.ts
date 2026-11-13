import { errorCodes, type FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  INLINE_ATTACHMENT_TYPE,
  MAX_ATTACHMENT_SIZE,
} from "@will-be-done/slices/space";
import { Effect } from "effect";
import {
  AttachmentStorage,
  type AttachmentStore,
} from "../../attachments/storage";
import {
  authenticateRequest,
  getAuthenticatedRequestUser,
} from "../../services/authentication";
import {
  attachToItem,
  createAttachment,
  deleteAttachment,
  getAttachment,
  getAttachmentContent,
  listAttachments,
  listItemAttachments,
  removeItemAttachment,
  uploadAttachmentContent,
} from "../../services/attachments";
import { sendError as handleError, unauthorized } from "../errors";
import {
  AttachmentParamsSchema,
  AttachmentResponseSchema,
  BinaryBodySchema,
  BinaryResponseSchema,
  CreateAttachmentQuerySchema,
  CreatedAttachmentResponseSchema,
  CreateItemAttachmentBodySchema,
  ErrorResponseSchema,
  ItemAttachmentParamsSchema,
  ItemAttachmentResponseSchema,
  ItemAttachmentsResponseSchema,
  ListAttachmentsQuerySchema,
  ListItemAttachmentsQuerySchema,
  PaginatedAttachmentsResponseSchema,
} from "../schemas";

const errorResponses = {
  400: ErrorResponseSchema,
  401: ErrorResponseSchema,
  403: ErrorResponseSchema,
  404: ErrorResponseSchema,
  500: ErrorResponseSchema,
};

// Clients sync every file on first open, which outruns the global limit.
const transferRateLimit = { rateLimit: { max: 1200, timeWindow: "1 minute" } };

const contentLength = (request: FastifyRequest) => {
  const header = request.headers["content-length"];
  return header === undefined ? undefined : Number(header);
};

const contentDisposition = (name: string, inline: boolean) =>
  `${inline ? "inline" : "attachment"}; filename="${name.replace(/[^\x20-\x7e]|["\\]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`;

export const attachmentRoutes: FastifyPluginAsyncZod<{
  storage: AttachmentStore;
}> = async (server, { storage }) => {
  const run = <A, E>(effect: Effect.Effect<A, E, AttachmentStorage>) =>
    Effect.runPromise(
      effect.pipe(Effect.provideService(AttachmentStorage, storage)),
    );

  // An upload body is read only for a known caller.
  server.addHook("onRequest", async (request, reply) => {
    if (request.method !== "POST" && request.method !== "PUT") return;
    if (!(await authenticateRequest(request))) return unauthorized(reply);
  });

  const requestUser = async (request: FastifyRequest) => {
    const known = getAuthenticatedRequestUser(request);
    return known === undefined ? authenticateRequest(request) : known;
  };

  // Handlers stream the body into storage. A declared length over the limit
  // is refused before any of it is read; storage stops at the declared length.
  server.addContentTypeParser(
    "application/octet-stream",
    (request, payload, done) => {
      if (Number(request.headers["content-length"]) > MAX_ATTACHMENT_SIZE) {
        done(new errorCodes.FST_ERR_CTP_BODY_TOO_LARGE());
        return;
      }
      done(null, payload);
    },
  );

  server.get(
    "/spaces/:spaceId/attachments",
    {
      schema: {
        operationId: "listAttachments",
        summary: "List a space's attachments",
        tags: ["Attachments"],
        security: [{ bearerAuth: [] }],
        params: z.object({ spaceId: z.string().min(1) }),
        querystring: ListAttachmentsQuerySchema,
        response: {
          200: PaginatedAttachmentsResponseSchema,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const user = await requestUser(request);
      if (!user) return unauthorized(reply);
      try {
        const page = await run(
          listAttachments({
            spaceId: request.params.spaceId,
            userId: user.id,
            ...request.query,
          }),
        );
        return reply.code(200).send(page);
      } catch (error) {
        return handleError(request, reply, error, "Failed to list attachments");
      }
    },
  );

  server.post(
    "/spaces/:spaceId/attachments",
    {
      config: transferRateLimit,
      schema: {
        operationId: "createAttachment",
        summary: "Upload a file as a new attachment",
        description:
          "Send the file content as the request body. Pass parentType and parentId to list it under a task, template, or note.",
        tags: ["Attachments"],
        security: [{ bearerAuth: [] }],
        consumes: ["application/octet-stream"],
        params: z.object({ spaceId: z.string().min(1) }),
        querystring: CreateAttachmentQuerySchema,
        body: BinaryBodySchema,
        response: {
          201: CreatedAttachmentResponseSchema,
          ...errorResponses,
          413: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const user = await requestUser(request);
      if (!user) return unauthorized(reply);
      const { name, mimeType, parentType, parentId } = request.query;
      try {
        const attachment = await run(
          createAttachment({
            spaceId: request.params.spaceId,
            userId: user.id,
            name,
            mimeType: mimeType ?? "application/octet-stream",
            body: request.body,
            contentLength: contentLength(request),
            ...(parentType && parentId
              ? { parent: { parentType, parentId } }
              : {}),
          }),
        );
        return reply.code(201).send({ attachment });
      } catch (error) {
        return handleError(
          request,
          reply,
          error,
          "Failed to create attachment",
        );
      }
    },
  );

  server.get(
    "/spaces/:spaceId/attachments/:attachmentId",
    {
      schema: {
        operationId: "getAttachment",
        summary: "Get an attachment and the items that list it",
        tags: ["Attachments"],
        security: [{ bearerAuth: [] }],
        params: AttachmentParamsSchema,
        response: { 200: AttachmentResponseSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const user = await requestUser(request);
      if (!user) return unauthorized(reply);
      try {
        const attachment = await run(
          getAttachment({
            spaceId: request.params.spaceId,
            userId: user.id,
            attachmentId: request.params.attachmentId,
          }),
        );
        return reply.code(200).send({ attachment });
      } catch (error) {
        return handleError(request, reply, error, "Failed to get attachment");
      }
    },
  );

  server.delete(
    "/spaces/:spaceId/attachments/:attachmentId",
    {
      schema: {
        operationId: "deleteAttachment",
        summary: "Delete an attachment",
        description:
          "Removes the file from every item and description that uses it.",
        tags: ["Attachments"],
        security: [{ bearerAuth: [] }],
        params: AttachmentParamsSchema,
        response: { 204: z.null(), ...errorResponses },
      },
    },
    async (request, reply) => {
      const user = await requestUser(request);
      if (!user) return unauthorized(reply);
      try {
        await run(
          deleteAttachment({
            spaceId: request.params.spaceId,
            userId: user.id,
            attachmentId: request.params.attachmentId,
          }),
        );
        return reply.code(204).send(null);
      } catch (error) {
        return handleError(
          request,
          reply,
          error,
          "Failed to delete attachment",
        );
      }
    },
  );

  server.get(
    "/spaces/:spaceId/attachments/:attachmentId/content",
    {
      config: transferRateLimit,
      schema: {
        operationId: "downloadAttachmentContent",
        summary: "Download an attachment's file content",
        description:
          "Responds 404 while the device that added the file has not uploaded it yet.",
        tags: ["Attachments"],
        security: [{ bearerAuth: [] }],
        params: AttachmentParamsSchema,
        response: {
          200: {
            description: "File content",
            content: {
              "application/octet-stream": { schema: BinaryResponseSchema },
            },
          },
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const user = await requestUser(request);
      if (!user) return unauthorized(reply);
      try {
        const { attachment, body, size } = await run(
          getAttachmentContent({
            spaceId: request.params.spaceId,
            userId: user.id,
            attachmentId: request.params.attachmentId,
          }),
        );
        const inline = INLINE_ATTACHMENT_TYPE.test(attachment.mimeType);
        return reply
          .code(200)
          .header(
            "Content-Type",
            inline ? attachment.mimeType : "application/octet-stream",
          )
          .header("Content-Length", size)
          .header(
            "Content-Disposition",
            contentDisposition(attachment.name, inline),
          )
          .header("Content-Security-Policy", "sandbox; default-src 'none'")
          .header("X-Content-Type-Options", "nosniff")
          .header("Cache-Control", "private, max-age=31536000, immutable")
          .send(body);
      } catch (error) {
        return handleError(
          request,
          reply,
          error,
          "Failed to download attachment",
        );
      }
    },
  );

  server.put(
    "/spaces/:spaceId/attachments/:attachmentId/content",
    {
      config: transferRateLimit,
      schema: {
        operationId: "uploadAttachmentContent",
        summary: "Upload the file content of an existing attachment",
        description:
          "For attachments created offline: the content must match the attachment's size and SHA-256. Repeating the upload is safe.",
        tags: ["Attachments"],
        security: [{ bearerAuth: [] }],
        consumes: ["application/octet-stream"],
        params: AttachmentParamsSchema,
        body: BinaryBodySchema,
        response: {
          204: z.null(),
          ...errorResponses,
          413: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const user = await requestUser(request);
      if (!user) return unauthorized(reply);
      try {
        await run(
          uploadAttachmentContent({
            spaceId: request.params.spaceId,
            userId: user.id,
            attachmentId: request.params.attachmentId,
            body: request.body,
            contentLength: contentLength(request),
          }),
        );
        return reply.code(204).send(null);
      } catch (error) {
        return handleError(
          request,
          reply,
          error,
          "Failed to upload attachment content",
        );
      }
    },
  );

  server.get(
    "/spaces/:spaceId/item-attachments",
    {
      schema: {
        operationId: "listItemAttachments",
        summary: "List the attachments of a task, template, or note",
        tags: ["Attachments"],
        security: [{ bearerAuth: [] }],
        params: z.object({ spaceId: z.string().min(1) }),
        querystring: ListItemAttachmentsQuerySchema,
        response: { 200: ItemAttachmentsResponseSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const user = await requestUser(request);
      if (!user) return unauthorized(reply);
      try {
        const itemAttachments = await run(
          listItemAttachments({
            spaceId: request.params.spaceId,
            userId: user.id,
            parent: request.query,
          }),
        );
        return reply.code(200).send({ itemAttachments });
      } catch (error) {
        return handleError(
          request,
          reply,
          error,
          "Failed to list item attachments",
        );
      }
    },
  );

  server.post(
    "/spaces/:spaceId/item-attachments",
    {
      schema: {
        operationId: "createItemAttachment",
        summary: "List an existing attachment under an item",
        tags: ["Attachments"],
        security: [{ bearerAuth: [] }],
        params: z.object({ spaceId: z.string().min(1) }),
        body: CreateItemAttachmentBodySchema,
        response: { 201: ItemAttachmentResponseSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const user = await requestUser(request);
      if (!user) return unauthorized(reply);
      const { attachmentId, parentType, parentId } = request.body;
      try {
        const itemAttachment = await run(
          attachToItem({
            spaceId: request.params.spaceId,
            userId: user.id,
            attachmentId,
            parent: { parentType, parentId },
          }),
        );
        return reply.code(201).send({ itemAttachment });
      } catch (error) {
        return handleError(
          request,
          reply,
          error,
          "Failed to attach attachment",
        );
      }
    },
  );

  server.delete(
    "/spaces/:spaceId/item-attachments/:itemAttachmentId",
    {
      schema: {
        operationId: "deleteItemAttachment",
        summary: "Remove an attachment from an item",
        description:
          "Also removes it from the item's description. The file is deleted when no other item lists it.",
        tags: ["Attachments"],
        security: [{ bearerAuth: [] }],
        params: ItemAttachmentParamsSchema,
        response: { 204: z.null(), ...errorResponses },
      },
    },
    async (request, reply) => {
      const user = await requestUser(request);
      if (!user) return unauthorized(reply);
      try {
        await run(
          removeItemAttachment({
            spaceId: request.params.spaceId,
            userId: user.id,
            itemAttachmentId: request.params.itemAttachmentId,
          }),
        );
        return reply.code(204).send(null);
      } catch (error) {
        return handleError(
          request,
          reply,
          error,
          "Failed to remove item attachment",
        );
      }
    },
  );
};
