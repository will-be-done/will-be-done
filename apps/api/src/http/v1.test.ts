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
} from "@will-be-done/slices/space";
import { dbIdTrait } from "@will-be-done/slices/traits";
import { spacesTable, spacesTableType } from "@will-be-done/slices/user";
import { createAppRouter } from "../appRouter";
import * as databases from "../db/db";
import { createServer } from "../server";
import { register, tokensTable, usersTable } from "../slices/authSlice";
import { dbsTable } from "../slices/dbSlice";

const action = createAction();

describe("v1 recurring-task preparation", () => {
  afterEach(() => {
    mock.restore();
  });

  test("preserves the generation checkpoint while updating a recurrence", async () => {
    const now = new Date("2026-08-05T12:00:00.000Z").getTime();
    const checkpoint = now - 2 * 24 * 60 * 60 * 1000;
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
      name: "seedApiRecurrencePatchTest",
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
    const seedTemplate = action({
      name: "seedApiRecurrencePatchTemplateTest",
      args: {},
      handler: function* () {
        yield* insert(projectSectionsTable, [
          {
            id: "section-1",
            type: projectSectionType,
            title: "Section",
            orderToken,
            projectId: "project-1",
            createdAt: checkpoint,
          },
        ]);
        yield* insert(taskTemplatesTable, [
          {
            id: "template-1",
            type: taskTemplateType,
            title: "Template",
            orderToken,
            repeatRule: "FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1",
            repeatRuleDtStart: checkpoint,
            createdAt: checkpoint,
            lastGeneratedAt: checkpoint,
            projectSectionId: "section-1",
          },
        ]);
      },
    });
    syncDispatch(userDB, seed({}));
    syncDispatch(spaceDB, seedTemplate({}));

    spyOn(Date, "now").mockReturnValue(now);
    spyOn(databases, "getMainHyperDB").mockImplementation(() => mainDB);
    spyOn(databases, "getHyperDB").mockImplementation((config) =>
      config.dbType === "user"
        ? ({ db: userDB } as unknown as ReturnType<typeof databases.getHyperDB>)
        : ({ db: spaceDB } as unknown as ReturnType<
            typeof databases.getHyperDB
          >),
    );

    const server = createServer({
      appRouter: createAppRouter({ mainDB, captchaConfig: null }),
      logger: false,
      serveFrontend: false,
    });
    try {
      const response = await server.inject({
        method: "PATCH",
        url: "/api/v1/spaces/space-1/task-templates/template-1",
        headers: { authorization: `Bearer ${auth.token}` },
        payload: {
          repeatRule: "FREQ=DAILY;INTERVAL=1",
          repeatRuleDtStart: checkpoint,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(
        selectSync(spaceDB, { selector: allTasks, args: {} }),
      ).toHaveLength(3);
    } finally {
      await server.close();
    }
  });
});
