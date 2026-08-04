import { describe, expect, test } from "bun:test";
import { DB } from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { createAppRouter } from "./appRouter";
import { createServer } from "./server";

describe("API documentation", () => {
  test("serves the OpenAPI document through Scalar", async () => {
    const appRouter = createAppRouter({
      mainDB: new DB(new BptreeInmemDriver()),
      captchaConfig: null,
    });
    const server = createServer({
      appRouter,
      logger: false,
      serveFrontend: false,
    });

    try {
      await server.ready();

      const docsResponse = await server.inject({
        method: "GET",
        url: "/api/docs/",
      });
      const openApiResponse = await server.inject({
        method: "GET",
        url: "/api/openapi.json",
      });
      const badRequestResponse = await server.inject({
        method: "POST",
        url: "/api/v1/spaces",
        payload: {},
      });

      expect(docsResponse.statusCode).toBe(200);
      expect(docsResponse.headers["content-type"]).toContain("text/html");
      expect(docsResponse.body).toContain("Scalar");
      expect(docsResponse.body).toContain("/api/openapi.json");

      expect(openApiResponse.statusCode).toBe(200);
      const openApiDocument = openApiResponse.json();
      expect(openApiDocument).toMatchObject({
        openapi: "3.1.0",
        info: {
          title: "Will Be Done API",
        },
      });
      expect(openApiDocument.paths).toMatchObject({
        "/api/v1/spaces/{spaceId}": { get: { operationId: "getSpace" } },
        "/api/v1/spaces/{spaceId}/projects/{projectId}": {
          get: { operationId: "getProject" },
        },
        "/api/v1/spaces/{spaceId}/sections/{sectionId}": {
          get: { operationId: "getProjectSection" },
        },
        "/api/v1/spaces/{spaceId}/tasks": {
          get: { operationId: "listTasks" },
        },
        "/api/v1/spaces/{spaceId}/daily-lists": {
          get: { operationId: "listDailyLists" },
        },
        "/api/v1/spaces/{spaceId}/scheduled-tasks": {
          get: { operationId: "listScheduledTasks" },
        },
      });
      expect(badRequestResponse.statusCode).toBe(400);
      expect(badRequestResponse.json()).toMatchObject({
        code: "BAD_REQUEST",
        message: expect.any(String),
      });

      const invalidRuleResponse = await server.inject({
        method: "POST",
        url: "/api/v1/spaces/space-1/sections/section-1/task-templates",
        payload: { title: "Invalid", repeatRule: "not-an-rrule" },
      });
      expect(invalidRuleResponse.statusCode).toBe(400);

      const invalidRangeResponse = await server.inject({
        method: "GET",
        url: "/api/v1/spaces/space-1/daily-lists?from=2026-08-10&to=2026-08-01",
      });
      expect(invalidRangeResponse.statusCode).toBe(400);

      const methods = new Set([
        "get",
        "post",
        "put",
        "patch",
        "delete",
        "options",
        "head",
      ]);
      for (const path of Object.values(
        openApiDocument.paths as Record<string, Record<string, unknown>>,
      )) {
        for (const [method, value] of Object.entries(path)) {
          if (!methods.has(method)) continue;
          const operation = value as {
            parameters?: unknown;
            requestBody?: unknown;
            responses: Record<string, unknown>;
          };
          const requiresBadRequest =
            method !== "get" ||
            operation.parameters !== undefined ||
            operation.requestBody !== undefined;
          if (!requiresBadRequest) continue;

          expect(JSON.stringify(operation.responses["400"])).toContain(
            "BAD_REQUEST",
          );
        }
      }
    } finally {
      await server.close();
    }
  });
});
