import type { FastifyRequest } from "fastify";
import { Context, Effect } from "effect";
import type { Databases } from "./services/databases";

export type RequestServices = Databases;

declare module "fastify" {
  interface FastifyInstance {
    services: Context.Context<RequestServices>;
  }
}

export const runRequest = <A, E>(
  request: FastifyRequest,
  effect: Effect.Effect<A, E, RequestServices>,
) => Effect.runPromiseWith(request.server.services)(effect);
