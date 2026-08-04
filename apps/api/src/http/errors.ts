import type { FastifyReply, FastifyRequest } from "fastify";
import { DatabaseAccessDeniedError } from "../services/databaseAccess";
import {
  BadRequestError,
  ConflictError,
  ResourceNotFoundError,
} from "../services/errors";

export function unauthorized(reply: FastifyReply) {
  return reply.code(401).send({
    code: "UNAUTHORIZED",
    message: "A valid bearer token is required",
  });
}

export function sendError(
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
  fallbackMessage: string,
) {
  if (error instanceof DatabaseAccessDeniedError) {
    return reply.code(403).send({
      code: "FORBIDDEN",
      message: "You do not have access to this space",
    });
  }
  if (error instanceof BadRequestError) {
    return reply
      .code(400)
      .send({ code: "BAD_REQUEST", message: error.message });
  }
  if (error instanceof ResourceNotFoundError) {
    return reply.code(404).send({ code: "NOT_FOUND", message: error.message });
  }
  if (error instanceof ConflictError) {
    return reply.code(409).send({ code: "CONFLICT", message: error.message });
  }
  request.log.error(error, fallbackMessage);
  return reply.code(500).send({
    code: "INTERNAL_SERVER_ERROR",
    message: fallbackMessage,
  });
}
