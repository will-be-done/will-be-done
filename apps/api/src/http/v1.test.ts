import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import {
  createAction,
  DB,
  execSync,
  insert,
  selectSync,
  syncDispatch,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import {
  allTasks,
  projectSectionsTable,
  projectSectionType,
  registeredSpaceSyncableTables,
  taskTemplatesTable,
  taskTemplateType,
  type TaskTemplate,
} from "@will-be-done/slices/space";
import { dbIdTrait } from "@will-be-done/slices/traits";
import { spacesTable, spacesTableType } from "@will-be-done/slices/user";
import { createAppRouter } from "../appRouter";
import * as databases from "../db/db";
import { createServer } from "../server";
import { register, tokensTable, usersTable } from "../slices/authSlice";
import { dbsTable } from "../slices/dbSlice";
import type { BackendAnalyticsEvent } from "../analytics";
import { getEnvConfig } from "../env";

const action = createAction();

const startApi = (templates: TaskTemplate[]) => {
  const orderToken = generateJitteredKeyBetween(null, null);
  const mainDB = new DB(new BptreeInmemDriver());
  const userDB = new DB(new BptreeInmemDriver());
  const spaceDB = new DB(new BptreeInmemDriver(), {
    traits: [dbIdTrait("space", "a0000000-0000-4000-8000-000000000001")],
  });
  execSync(mainDB.loadTables([usersTable, tokensTable, dbsTable]));
  execSync(userDB.loadTables([spacesTable]));
  execSync(spaceDB.loadTables(registeredSpaceSyncableTables));

  const auth = syncDispatch(
    mainDB,
    register({ email: "user@example.com", hashedPassword: "hash" }),
  );
  const seed = action({
    name: "seedApiRecurrenceSpace",
    args: {},
    handler: function* () {
      yield* insert(spacesTable, [
        {
          id: "space-1",
          type: spacesTableType,
          name: "Space",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ]);
    },
  });
  syncDispatch(userDB, seed({}));
  const insertTemplates = (rows: TaskTemplate[]) =>
    syncDispatch(
      spaceDB,
      action({
        name: "seedApiRecurrenceTemplates",
        args: {},
        handler: function* () {
          yield* insert(taskTemplatesTable, rows);
        },
      })({}),
    );
  syncDispatch(
    spaceDB,
    action({
      name: "seedApiRecurrenceSection",
      args: {},
      handler: function* () {
        yield* insert(projectSectionsTable, [
          {
            id: "section-1",
            type: projectSectionType,
            title: "Section",
            orderToken,
            projectId: "project-1",
            createdAt: 0,
          },
        ]);
      },
    })({}),
  );
  insertTemplates(templates);

  spyOn(databases, "getMainHyperDB").mockImplementation(async () => mainDB);
  spyOn(databases, "getHyperDB").mockImplementation(async (config) =>
    config.dbType === "user"
      ? ({ db: userDB } as unknown as ReturnType<typeof databases.getHyperDB>)
      : ({ db: spaceDB } as unknown as ReturnType<typeof databases.getHyperDB>),
  );
  const analyticsEvents: BackendAnalyticsEvent[] = [];
  const analytics = {
    capture: (event: BackendAnalyticsEvent) => analyticsEvents.push(event),
    shutdown: async () => {},
  };
  const server = createServer({
    appRouter: createAppRouter({ mainDB, captchaConfig: null, analytics }),
    logger: false,
    serveFrontend: false,
    analytics,
  });
  const template = (
    id: string,
    fields: Partial<TaskTemplate>,
  ): TaskTemplate => ({
    id,
    type: taskTemplateType,
    title: id,
    orderToken,
    repeatRule: "FREQ=DAILY;INTERVAL=1",
    repeatRuleDtStart: 0,
    createdAt: 0,
    lastGeneratedAt: 0,
    projectSectionId: "section-1",
    ...fields,
  });
  return {
    auth,
    spaceDB,
    server,
    analyticsEvents,
    insertTemplates,
    template,
    tasks: () => selectSync(spaceDB, { selector: allTasks, args: {} }),
  };
};

describe("v1 recurring-task preparation", () => {
  afterEach(() => {
    mock.restore();
  });

  test("preserves the generation checkpoint while updating a recurrence", async () => {
    const now = new Date("2026-08-05T12:00:00.000Z").getTime();
    const checkpoint = now - 2 * 24 * 60 * 60 * 1000;
    spyOn(Date, "now").mockReturnValue(now);
    const api = startApi([]);
    api.insertTemplates([
      api.template("template-1", {
        repeatRule: "FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1",
        repeatRuleDtStart: checkpoint,
        createdAt: checkpoint,
        lastGeneratedAt: checkpoint,
      }),
    ]);
    try {
      const response = await api.server.inject({
        method: "PATCH",
        url: "/api/v1/spaces/space-1/task-templates/template-1",
        headers: { authorization: `Bearer ${api.auth.token}` },
        payload: {
          repeatRule: "FREQ=DAILY;INTERVAL=1",
          repeatRuleDtStart: checkpoint,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(api.tasks()).toHaveLength(3);
      expect(api.analyticsEvents).toContainEqual({
        name: "public_api_used",
        distinctId: api.auth.userId,
        properties: {
          method: "PATCH",
          operation: "updateTaskTemplate",
          status_class: "2xx",
        },
      });
    } finally {
      await api.server.close();
    }
  });

  test("checks recurrence at most once per generation interval", async () => {
    const start = new Date("2026-08-05T12:00:00.000Z").getTime();
    const interval = getEnvConfig().WBD_TASK_GENERATION_INTERVAL_MS;
    const dueSince = (id: string) =>
      api.template(id, {
        repeatRuleDtStart: start - 2 * 24 * 60 * 60 * 1000,
        createdAt: start - 2 * 24 * 60 * 60 * 1000,
        lastGeneratedAt: start - 2 * 24 * 60 * 60 * 1000,
      });
    const clock = spyOn(Date, "now").mockReturnValue(start);
    const api = startApi([]);
    const listProjects = () =>
      api.server.inject({
        method: "GET",
        url: "/api/v1/spaces/space-1/projects",
        headers: { authorization: `Bearer ${api.auth.token}` },
      });
    try {
      api.insertTemplates([dueSince("template-first")]);
      expect((await listProjects()).statusCode).toBe(200);
      const afterFirstCheck = api.tasks().length;
      expect(afterFirstCheck).toBeGreaterThan(0);

      api.insertTemplates([dueSince("template-second")]);
      clock.mockReturnValue(start + interval - 1);
      expect((await listProjects()).statusCode).toBe(200);
      expect(api.tasks()).toHaveLength(afterFirstCheck);

      clock.mockReturnValue(start + interval);
      expect((await listProjects()).statusCode).toBe(200);
      expect(api.tasks().length).toBeGreaterThan(afterFirstCheck);
    } finally {
      await api.server.close();
    }
  });
});
