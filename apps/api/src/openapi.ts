import { DB } from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { createAppRouter } from "./appRouter";
import { createServer } from "./server";
import { testServices } from "./services/testing";

export async function buildOpenApiDocument() {
  const services = testServices(new DB(new BptreeInmemDriver()));
  const server = createServer({
    appRouter: createAppRouter({ ...services, captchaConfig: null }),
    databases: services.databases,
    logger: false,
    serveFrontend: false,
  });

  try {
    await server.ready();
    return server.swagger();
  } finally {
    await server.close();
  }
}
