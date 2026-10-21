// Test-only API entry point. Production start.ts never imports this module.
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
const server = createServer({
  mainDB,
  appRouter: createAppRouter({ mainDB, captchaConfig: null, accountEmail }),
  logger: false,
  serveFrontend: false,
  rateLimit: { enabled: false, backend: "memory" },
});
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
