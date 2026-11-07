import type { FastifyReply, FastifyRequest } from "fastify";
import { Cause, Effect, Option } from "effect";
import type { ServiceError } from "../services/errors";
import { runRequest, type RequestServices } from "../runtime";

function sendServiceError(reply: FastifyReply, error: ServiceError) {
  switch (error._tag) {
    case "UnauthorizedError":
      return reply
        .code(401)
        .send({ code: "UNAUTHORIZED", message: error.message });
    case "DatabaseAccessDeniedError":
      return reply.code(403).send({
        code: "FORBIDDEN",
        message: "You do not have access to this space",
      });
    case "BadRequestError":
      return reply
        .code(400)
        .send({ code: "BAD_REQUEST", message: error.message });
    case "ResourceNotFoundError":
      return reply
        .code(404)
        .send({ code: "NOT_FOUND", message: error.message });
    case "ConflictError":
      return reply.code(409).send({ code: "CONFLICT", message: error.message });
  }
}

export function sendFailure(
  request: FastifyRequest,
  reply: FastifyReply,
  cause: Cause.Cause<ServiceError>,
  fallbackMessage: string,
) {
  const error = Cause.findErrorOption(cause);
  if (Option.isSome(error)) return sendServiceError(reply, error.value);

  request.log.error(Cause.squash(cause), fallbackMessage);
  return reply.code(500).send({
    code: "INTERNAL_SERVER_ERROR",
    message: fallbackMessage,
  });
}

// `handle` sends the success reply so each route keeps its typed response.
export function runRoute<A>(
  request: FastifyRequest,
  reply: FastifyReply,
  fallbackMessage: string,
  handle: Effect.Effect<A, ServiceError, RequestServices>,
) {
  return runRequest(
    request,
    handle.pipe(
      Effect.catchCause((cause) =>
        Effect.sync(() => sendFailure(request, reply, cause, fallbackMessage)),
      ),
    ),
  );
}
