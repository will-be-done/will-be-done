// Test-only API entry point. Production start.ts never imports this module.
import { createGoogleService } from "../apps/api/src/google/service";
import type { GoogleProfile } from "../apps/api/src/google/tables";
import { createAppRouter } from "../apps/api/src/appRouter";
import { closeDatabases, getMainHyperDB } from "../apps/api/src/db/db";
import { createServer } from "../apps/api/src/server";
import {
  createAccountEmailService,
  createEmailWorker,
} from "../apps/api/src/email/service";
import type { EmailPayload } from "../apps/api/src/email/templates";

const mainDB = await getMainHyperDB();
const messages: EmailPayload[] = [];
const config = {
  apiKey: "test-only",
  from: "Will Be Done <accounts@example.com>",
  appUrl: `http://127.0.0.1:${process.env.PLAYWRIGHT_WEB_PORT ?? "5174"}`,
};
const accountEmail = createAccountEmailService(mainDB, config);
const worker = createEmailWorker(
  mainDB,
  {
    async send(payload) {
      messages.push(payload);
      return crypto.randomUUID();
    },
  },
  { paceMs: 0, log: () => {} },
);
const google =
  process.env.WBD_E2E_GOOGLE_ENABLED === "true"
    ? createGoogleService(
        mainDB,
        {
          clientId: "test-client",
          clientSecret: "test-secret",
          appUrl: config.appUrl,
        },
        {
          emailConfig: config,
          provider: {
            authorizationUrl: (flow) =>
              `${config.appUrl}/api/__test/google/authorize?state=${flow.id}`,
            async verify(code) {
              return JSON.parse(
                Buffer.from(code, "base64url").toString(),
              ) as GoogleProfile;
            },
          },
        },
      )
    : undefined;
const server = createServer({
  google,
  mainDB,
  appRouter: createAppRouter({
    mainDB,
    captchaConfig: null,
    accountEmail,
    google,
  }),
  logger: false,
  serveFrontend: false,
  rateLimit: { enabled: false, backend: "memory" },
});
if (google) {
  server.get<{ Querystring: { state: string } }>(
    "/api/__test/google/authorize",
    (request, reply) => {
      const state = request.query.state;
      if (!/^[\w-]{43}$/.test(state)) return reply.code(400).send();
      return reply.type("text/html")
        .send(`<!doctype html><html lang="en"><head><title>Test Google</title></head><body>
      <h1>Test Google account</h1><form action="/api/__test/google/consent">
      <input type="hidden" name="state" value="${state}">
      <label>Google email<input type="email" name="email" required></label>
      <label>Google account ID<input name="subject" required></label>
      <button type="submit">Approve Google sign-in</button>
      <button type="submit" name="denied" value="true" formnovalidate>Deny Google sign-in</button>
      </form></body></html>`);
    },
  );
  server.get<{
    Querystring: {
      state: string;
      email: string;
      subject: string;
      denied?: string;
    };
  }>("/api/__test/google/consent", (request, reply) => {
    const { state, email, subject, denied } = request.query;
    const code = Buffer.from(
      JSON.stringify({
        subject,
        email,
        emailAuthoritative: email?.endsWith("@gmail.com") ?? false,
      }),
    ).toString("base64url");
    return reply.redirect(
      `/api/auth/google/callback?${new URLSearchParams({ state, ...(denied ? { error: "access_denied" } : { code }) })}`,
    );
  });
}
server.get<{ Querystring: { to: string } }>(
  "/__test/emails",
  async (request) => {
    await worker.runOnce();
    return messages.filter((message) => message.to === request.query.to);
  },
);
server.addHook("onReady", async () => {
  worker.start();
});
server.addHook("onClose", async () => {
  await worker.stop();
  await closeDatabases();
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
await server.listen({
  host: "127.0.0.1",
  port: Number(process.env.PORT ?? "3200"),
});
