import { afterAll, beforeEach, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addDays, formatDate } from "./dates.ts";

type Recorded = {
  method: string;
  path: string;
  body: unknown;
  auth: string | null;
};
let requests: Array<Recorded> = [];

const task = (id: string, overrides: Record<string, unknown> = {}) => ({
  type: "task",
  id,
  title: `Task ${id}`,
  state: "todo",
  projectSectionId: "section-inbox",
  nature: "unknown",
  createdAt: 0,
  lastToggledAt: 0,
  scheduledDate: null,
  scheduledTime: null,
  durationMinutes: null,
  ...overrides,
});

const space = "/api/v1/spaces/space-1";

const routes: Record<string, (url: URL, body: unknown) => unknown> = {
  "GET /api/v1/spaces": () => ({
    spaces: [
      {
        id: "space-1",
        name: "Personal",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ],
  }),
  [`GET ${space}/scheduled-tasks`]: (url) =>
    url.searchParams.get("cursor") === "page-2"
      ? { tasks: [task("overdue-2")], nextCursor: null }
      : { tasks: [task("overdue-1")], nextCursor: "page-2" },
  [`GET ${space}/daily-lists/${formatDate(new Date())}/items`]: () => ({
    items: [task("today-1")],
  }),
  [`GET ${space}/projects`]: () => ({
    projects: [
      { id: "work", title: "Work", icon: "", isInbox: false, createdAt: 0 },
      { id: "inbox", title: "Inbox", icon: "", isInbox: true, createdAt: 0 },
    ],
  }),
  [`GET ${space}/projects/inbox/sections`]: () => ({
    sections: [
      { id: "section-inbox", projectId: "inbox", title: "", createdAt: 0 },
    ],
  }),
  [`POST ${space}/sections/section-inbox/tasks`]: (_url, body) => ({
    task: task("new", { title: (body as { title: string }).title }),
  }),
  [`POST ${space}/tasks/new/schedule`]: (_url, body) => {
    const { date } = body as { date: string };
    return {
      task: task("new", { title: "Buy milk", scheduledDate: date }),
      date,
    };
  },
};

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: async (request) => {
    const url = new URL(request.url);
    const body = request.method === "GET" ? undefined : await request.json();
    const auth = request.headers.get("authorization");
    requests.push({ method: request.method, path: url.pathname, body, auth });
    if (auth !== "Bearer test-token") {
      return Response.json(
        { code: "UNAUTHORIZED", message: "A valid bearer token is required" },
        { status: 401 },
      );
    }
    const route = routes[`${request.method} ${url.pathname}`];
    if (!route) return new Response("Not found", { status: 404 });
    return Response.json(route(url, body), {
      status:
        request.method === "POST" && url.pathname.endsWith("/tasks")
          ? 201
          : 200,
    });
  },
});

afterAll(() => server.stop(true));
beforeEach(() => {
  requests = [];
});

const run = async (args: Array<string>, env: Record<string, string> = {}) => {
  const proc = Bun.spawn(["bun", join(import.meta.dir, "main.ts"), ...args], {
    env: {
      ...process.env,
      WBD_SERVER: server.url.origin,
      WBD_TOKEN: "test-token",
      WBD_SPACE: "Personal",
      WBD_CONFIG_DIR: mkdtempSync(join(tmpdir(), "wbd-test-")),
      NO_COLOR: "1",
      ...env,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, code };
};

test("today combines every overdue page with today's list", async () => {
  const { stdout, code } = await run(["today", "--json"]);

  expect(code).toBe(0);
  const result = JSON.parse(stdout);
  expect(result.overdue.map((t: { id: string }) => t.id)).toEqual([
    "overdue-1",
    "overdue-2",
  ]);
  expect(result.today.map((t: { id: string }) => t.id)).toEqual(["today-1"]);
});

test("task add puts the task in the Inbox and schedules it", async () => {
  const { stdout, code } = await run([
    "task",
    "add",
    "Buy milk",
    "--date",
    "tomorrow",
  ]);

  expect(code).toBe(0);
  expect(stdout).toContain('✓ Added "Buy milk"');
  const writes = requests.filter((r) => r.method === "POST");
  expect(writes).toEqual([
    expect.objectContaining({
      path: `${space}/sections/section-inbox/tasks`,
      body: { title: "Buy milk" },
    }),
    expect.objectContaining({
      path: `${space}/tasks/new/schedule`,
      body: { date: addDays(formatDate(new Date()), 1), time: null },
    }),
  ]);
});

test("rejected tokens point the user at auth login", async () => {
  const { stderr, code } = await run(["today"], { WBD_TOKEN: "revoked" });

  expect(code).toBe(1);
  expect(stderr).toContain("Not authenticated. Run `wbd auth login`.");
});

test("conflicting flags fail before any write", async () => {
  const { stderr, code } = await run([
    "task",
    "add",
    "x",
    "--stash",
    "--date",
    "today",
  ]);

  expect(code).toBe(1);
  expect(stderr).toContain("--stash can't be combined");
  expect(requests.filter((r) => r.method === "POST")).toEqual([]);
});
