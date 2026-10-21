import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { GoogleService } from "./service";

const idSchema = z.string().regex(/^[\w-]{43}$/);
const launchQuery = z.object({ id: idSchema, launch: idSchema });
const callbackQuery = z.object({
  state: idSchema,
  code: z.string().min(1).max(4096).optional(),
  error: z.string().max(256).optional(),
});

export function googleRoutes(server: FastifyInstance, google: GoogleService) {
  const secure = new URL(google.appUrl).protocol === "https:" ? "; Secure" : "";
  const cookie = (id: string, value: string, age: number) =>
    `wbd_google_${id}=${value}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=${age}${secure}`;
  const headers = {
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    "x-content-type-options": "nosniff",
  };
  const page = (message: string) =>
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Google sign-in · Will Be Done</title></head><body><h1>Will Be Done</h1><p>${message}</p><p>You can close this tab and return to the app.</p></body></html>`;

  server.get(
    "/api/auth/google/launch",
    { logLevel: "silent" },
    async (request, reply) => {
      reply.headers(headers);
      const parsed = launchQuery.safeParse(request.query);
      if (!parsed.success)
        return reply
          .code(400)
          .type("text/html")
          .send(page("Invalid sign-in link. Please start again in the app."));
      const { id, launch } = parsed.data;
      try {
        const browserSecret = randomBytes(32).toString("base64url");
        const url = await google.launch(id, launch, browserSecret);
        return reply
          .header("set-cookie", cookie(id, browserSecret, 600))
          .redirect(url);
      } catch {
        return reply
          .code(400)
          .type("text/html")
          .send(
            page(
              "This sign-in link has expired or was already used. Please start again in the app.",
            ),
          );
      }
    },
  );
  server.get(
    "/api/auth/google/callback",
    { logLevel: "silent" },
    async (request, reply) => {
      reply.headers(headers);
      const parsed = callbackQuery.safeParse(request.query);
      if (!parsed.success)
        return reply
          .code(400)
          .type("text/html")
          .send(
            page("Invalid Google response. Please start again in the app."),
          );
      const { state, code, error } = parsed.data;
      const browserSecret = (request.headers.cookie ?? "")
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`wbd_google_${state}=`))
        ?.split("=")[1];
      reply.header("set-cookie", cookie(state, "", 0));
      try {
        if (!browserSecret || !idSchema.safeParse(browserSecret).success)
          throw new Error("Missing browser binding");
        const success = await google.callback(
          state,
          browserSecret,
          code,
          Boolean(error),
        );
        return reply
          .type("text/html")
          .send(
            page(
              success
                ? "Google confirmed your identity. Return to the app to finish."
                : "Google sign-in was not completed. Please try again in the app.",
            ),
          );
      } catch {
        return reply
          .code(400)
          .type("text/html")
          .send(
            page(
              "This sign-in has expired or is no longer valid. Please start again in the app.",
            ),
          );
      }
    },
  );
}
