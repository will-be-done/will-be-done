import type { FastifyInstance } from "fastify";
import { authFlowCookie, authFlowRoutes } from "../auth/routes";
import type { GoogleService } from "./service";

export const googleCookie = (
  appUrl: string,
  id: string,
  value: string,
  age: number,
) => authFlowCookie("google", appUrl, id, value, age);

export function googleRoutes(server: FastifyInstance, google: GoogleService) {
  authFlowRoutes(server, google, "google");
}
