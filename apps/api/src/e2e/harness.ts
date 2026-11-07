import type { FastifyInstance } from "fastify";
import { expect } from "bun:test";
import { asyncDispatch } from "@will-be-done/hyperdb";
import { Context, Effect, Exit, Layer, Scope } from "effect";
import { createAppRouter } from "../appRouter";
import type { DBConfig } from "../db/db";
import { AppEnv } from "../env";
import { Databases } from "../services/databases";
import { SyncNotifications } from "../services/syncNotifications";
import {
  createProject,
  createProjectSection,
  createSectionTask,
  createSpace,
  listProjectSections,
  listProjects,
} from "../generated/v1-client";
import { createServer } from "../server";
import { register } from "../slices/authSlice";

type ApiResponse = { status: number; data: unknown };

const ServicesLive = Databases.layer.pipe(
  Layer.provideMerge(SyncNotifications.layer),
  Layer.provide(AppEnv.layer),
);

let active:
  | {
      server: FastifyInstance;
      databases: Databases["Service"];
      scope: Scope.Closeable;
    }
  | undefined;

export function expectResponseStatus<
  TResponse extends ApiResponse,
  const TStatus extends TResponse["status"],
>(
  response: TResponse,
  status: TStatus,
): Extract<TResponse, { status: TStatus }> {
  expect(response.status).toBe(status);
  if (response.status !== status) {
    throw new Error(
      `Expected API status ${status}, received ${response.status}: ${JSON.stringify(response.data)}`,
    );
  }
  return response as Extract<TResponse, { status: TStatus }>;
}

export async function startTestServer(): Promise<FastifyInstance> {
  if (active) return active.server;

  const scope = await Effect.runPromise(Scope.make());
  let server: FastifyInstance | undefined;
  try {
    const services = await Effect.runPromise(
      Layer.buildWithScope(ServicesLive, scope),
    );
    const databases = Context.get(services, Databases);
    server = createServer({
      appRouter: createAppRouter({
        mainDB: await Effect.runPromise(databases.main),
        databases,
        notifications: Context.get(services, SyncNotifications),
        captchaConfig: null,
      }),
      databases,
      logger: false,
      serveFrontend: false,
    });
    process.env.WBD_API_BASE_URL = await server.listen({
      host: "127.0.0.1",
      port: 0,
    });
    active = { server, databases, scope };
    return server;
  } catch (error) {
    await server?.close().catch((closeError: unknown) => {
      console.error(
        "Failed to close test server after startup failure",
        closeError,
      );
    });
    await Effect.runPromise(Scope.close(scope, Exit.void));
    throw error;
  }
}

export async function stopTestServer() {
  if (!active) return;
  const { server, scope } = active;
  active = undefined;
  try {
    await server.close();
  } finally {
    await Effect.runPromise(Scope.close(scope, Exit.void));
  }
}

export async function restartTestServer(): Promise<FastifyInstance> {
  await stopTestServer();
  return startTestServer();
}

const activeDatabases = () => {
  if (!active) throw new Error("The API E2E server is not running");
  return active.databases;
};

export const mainDatabase = () => Effect.runPromise(activeDatabases().main);

export const openDatabase = (config: DBConfig) =>
  Effect.runPromise(activeDatabases().open(config));

export async function createAuthorization(): Promise<string> {
  const auth = await asyncDispatch(
    await mainDatabase(),
    register({
      email: `api-client-e2e-${crypto.randomUUID()}@example.com`,
      hashedPassword: "unused-by-api-e2e",
    }),
  );
  return `Bearer ${auth.token}`;
}

export function requestOptions(authorization: string): RequestInit {
  return { headers: { Authorization: authorization } };
}

export async function createSpaceFixture(authorization: string) {
  const options = requestOptions(authorization);
  const spaceResult = expectResponseStatus(
    await createSpace({ name: `API E2E ${crypto.randomUUID()}` }, options),
    201,
  );
  const space = spaceResult.data.space;

  const projectsResult = expectResponseStatus(
    await listProjects(space.id, options),
    200,
  );
  const inbox = projectsResult.data.projects.find((project) => project.isInbox);
  if (!inbox) throw new Error("Space fixture did not create an inbox project");

  const sectionsResult = expectResponseStatus(
    await listProjectSections(space.id, inbox.id, options),
    200,
  );
  const section = sectionsResult.data.sections[0];
  if (!section)
    throw new Error("Space fixture did not create an inbox section");

  return { options, space, inbox, section };
}

export async function createProjectFixture(
  authorization: string,
  title = `Project ${crypto.randomUUID()}`,
) {
  const fixture = await createSpaceFixture(authorization);
  const projectResult = expectResponseStatus(
    await createProject(fixture.space.id, { title }, fixture.options),
    201,
  );
  const project = projectResult.data.project;
  return { ...fixture, project };
}

export async function createSectionFixture(
  authorization: string,
  title = `Section ${crypto.randomUUID()}`,
) {
  const fixture = await createProjectFixture(authorization);
  const sectionResult = expectResponseStatus(
    await createProjectSection(
      fixture.space.id,
      fixture.project.id,
      { title },
      fixture.options,
    ),
    201,
  );
  return { ...fixture, projectSection: sectionResult.data.section };
}

export async function createTaskFixture(authorization: string) {
  const fixture = await createSectionFixture(authorization);
  const taskResult = expectResponseStatus(
    await createSectionTask(
      fixture.space.id,
      fixture.projectSection.id,
      { title: `Task ${crypto.randomUUID()}` },
      fixture.options,
    ),
    201,
  );
  return { ...fixture, task: taskResult.data.task };
}
