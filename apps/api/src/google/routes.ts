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

export const googleCookie = (
  appUrl: string,
  id: string,
  value: string,
  age: number,
) =>
  `wbd_google_${id}=${value}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=${age}${new URL(appUrl).protocol === "https:" ? "; Secure" : ""}`;
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
const readCookie = (header: string | undefined, id: string) =>
  (header ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`wbd_google_${id}=`))
    ?.split("=")[1];

export function googleRoutes(server: FastifyInstance, google: GoogleService) {
  const cookie = (id: string, value: string, age: number) =>
    googleCookie(google.appUrl, id, value, age);
  const headers = {
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "content-security-policy":
      "default-src 'none'; form-action 'self' https://accounts.google.com; frame-ancestors 'none'; base-uri 'none'",
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
        const initiator = readCookie(request.headers.cookie, id);
        if (!initiator) {
          const target = await google.desktopLaunch(id, launch);
          return reply
            .header("referrer-policy", "same-origin")
            .type("text/html")
            .send(
              `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Confirm Google sign-in · Will Be Done</title></head><body><h1>Confirm in Will Be Done</h1><p>${target.intent === "link" ? `Connect Google to the Will Be Done account <strong>${escapeHtml(target.email!)}</strong>.` : "Sign in to Will Be Done on your desktop app."}</p><p>Continue only if you started this request in your own app. Enter the code displayed there. Never enter a code sent by someone else.</p><form method="post" action="/api/auth/google/launch"><input type="hidden" name="id" value="${id}"><input type="hidden" name="launch" value="${launch}"><label>Confirmation code <input name="confirmationCode" required autocomplete="off" minlength="12" maxlength="12"></label><button type="submit">Continue to Google</button></form></body></html>`,
            );
        }
        const browserSecret = randomBytes(32).toString("base64url");
        const url = await google.launch(id, launch, browserSecret, {
          initiator,
        });
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
  server.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string", bodyLimit: 1024 },
    (_request, body, done) => {
      done(null, Object.fromEntries(new URLSearchParams(body as string)));
    },
  );
  server.post(
    "/api/auth/google/launch",
    { logLevel: "silent", bodyLimit: 1024 },
    async (request, reply) => {
      reply.headers(headers);
      const parsed = launchQuery
        .extend({ confirmationCode: z.string().regex(/^[\w-]{12}$/) })
        .safeParse(request.body);
      try {
        // A cross-site form must not bypass the confirmation page.
        if (request.headers.origin !== google.appUrl)
          throw new Error("Invalid confirmation origin");
        if (!parsed.success) throw new Error("Invalid confirmation");
        const { id, launch, confirmationCode } = parsed.data;
        const browserSecret = randomBytes(32).toString("base64url");
        const url = await google.launch(id, launch, browserSecret, {
          confirmationCode,
        });
        return reply
          .header("set-cookie", cookie(id, browserSecret, 600))
          .redirect(url, 303);
      } catch {
        return reply
          .code(400)
          .type("text/html")
          .send(
            page(
              "Invalid or expired confirmation code. Please start again in the app.",
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
      const browserSecret = readCookie(request.headers.cookie, state);
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
