import type { FastifyInstance } from "fastify";
import { expect } from "bun:test";
import { syncDispatch } from "@will-be-done/hyperdb";
import { createAppRouter } from "../appRouter";
import { closeDatabases, getMainHyperDB } from "../db/db";
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

let activeTestServer: FastifyInstance | undefined;

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
  if (activeTestServer) return activeTestServer;

  const mainDB = getMainHyperDB();
  const server = createServer({
    appRouter: createAppRouter({ mainDB, captchaConfig: null }),
    logger: false,
    serveFrontend: false,
  });
  process.env.WBD_API_BASE_URL = await server.listen({
    host: "127.0.0.1",
    port: 0,
  });
  activeTestServer = server;
  return server;
}

export async function stopTestServer() {
  await activeTestServer?.close();
  activeTestServer = undefined;
  closeDatabases();
}

export async function restartTestServer(): Promise<FastifyInstance> {
  await stopTestServer();
  return startTestServer();
}

export function createAuthorization(): string {
  const auth = syncDispatch(
    getMainHyperDB(),
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
