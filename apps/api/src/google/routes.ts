import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { GoogleService } from "./service";

const idSchema = z.string().regex(/^[\w-]{43}$/);
const launchQuery = z.object({
  id: idSchema,
  launch: idSchema,
  // The desktop app's loopback listener, added by the app when it opens the link.
  port: z.coerce.number().int().min(1024).max(65535).optional(),
});
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
  const cookie = googleCookie;
  const headers = {
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "content-security-policy":
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    "x-content-type-options": "nosniff",
  };
  const page = (message: string) =>
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Google sign-in · Will Be Done</title></head><body><h1>Will Be Done</h1><p>${message}</p><p>You can close this tab and return to the app.</p></body></html>`;
  const returnToApp = (
    reply: FastifyReply,
    id: string,
    { appUrl, loopbackPort }: { appUrl: string; loopbackPort?: number },
    completion?: string,
  ) => {
    if (loopbackPort !== undefined) {
      const target = new URL(`http://127.0.0.1:${loopbackPort}/google-auth`);
      target.searchParams.set("state", id);
      if (completion) target.searchParams.set("code", completion);
      return reply.redirect(target.href, 302);
    }
    const nonce = randomBytes(16).toString("base64url");
    const script = `try { const channel = new BroadcastChannel(${JSON.stringify(`wbd-google-${id}`)}); channel.postMessage("complete"); channel.close(); } catch {} window.close();`;
    return reply
      .header(
        "content-security-policy",
        `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'`,
      )
      .type("text/html")
      .send(
        `<!doctype html><html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <title>Will Be Done</title>
  <style nonce="${nonce}">
    body { font-family: system-ui, sans-serif; margin: 2rem; }
    main { visibility: hidden; animation: reveal 0s 1.5s forwards; }
    @keyframes reveal { to { visibility: visible; } }
  </style>
</head>
<body>
  <main>
    <p>If you haven’t returned to the app automatically:</p>
    <a href="${escapeHtml(appUrl)}">Return to Will Be Done</a>
  </main>
  <script nonce="${nonce}">${script}</script>
</body>
</html>`,
      );
  };

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
      const { id, launch, port } = parsed.data;
      try {
        const { appUrl } = await google.returnTarget(id);
        const browserSecret = randomBytes(32).toString("base64url");
        const url = await google.launch(id, launch, browserSecret, {
          initiator: readCookie(request.headers.cookie, id),
          loopbackPort: port,
        });
        return reply
          .header("set-cookie", cookie(appUrl, id, browserSecret, 600))
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
      if (!parsed.success) return reply.redirect(google.appUrl);
      const { state, code, error } = parsed.data;
      const browserSecret = readCookie(request.headers.cookie, state);
      let target: { appUrl: string; loopbackPort?: number } = {
        appUrl: google.appUrl,
      };
      reply.header("set-cookie", cookie(target.appUrl, state, "", 0));
      try {
        target = await google.returnTarget(state);
        if (!browserSecret || !idSchema.safeParse(browserSecret).success)
          throw new Error("Missing browser binding");
        const completion = await google.callback(
          state,
          browserSecret,
          code,
          Boolean(error),
        );
        return returnToApp(reply, state, target, completion);
      } catch {
        reply.code(400);
        return returnToApp(reply, state, target);
      }
    },
  );
}
