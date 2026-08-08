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
import {
  projectType,
  projectsTable,
  type Project,
} from "@will-be-done/slices/space";
import * as databases from "../db/db";
import { dbsTable, getDbById, getDbByIdOrCreate } from "../slices/dbSlice";
import { DatabaseAccessDeniedError } from "./databaseAccess";
import { spacesTable, spacesTableType } from "@will-be-done/slices/user";
import { ResourceNotFoundError } from "./errors";
import { listSpaceProjects } from "./projects";

const action = createAction();
const seedProjects = action({
  name: "seedProjects",
  args: {},
  handler: function* () {
    const projects: Project[] = [
      {
        type: projectType,
        id: "second",
        title: "Second",
        icon: "2",
        isInbox: false,
        orderToken: "b",
        createdAt: 200,
      },
      {
        type: projectType,
        id: "first",
        title: "First",
        icon: "1",
        isInbox: true,
        orderToken: "a",
        createdAt: 100,
      },
    ];

    yield* insert(projectsTable, projects);
  },
});
const seedSpaceMembership = action({
  name: "seedApiProjectTestSpaceMembership",
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

describe("listSpaceProjects", () => {
  afterEach(() => {
    mock.restore();
  });

  test("returns public project fields in display order and enforces ownership", async () => {
    const mainDB = new DB(new BptreeInmemDriver());
    const userDB = new DB(new BptreeInmemDriver());
    const spaceDB = new DB(new BptreeInmemDriver());
    execSync(mainDB.loadTables([dbsTable]));
    syncDispatch(
      mainDB,
      getDbByIdOrCreate({
        id: "space-1",
        type: "space",
        userId: "user-1",
      }),
    );
    execSync(userDB.loadTables([spacesTable]));
    syncDispatch(userDB, seedSpaceMembership({}));
    execSync(spaceDB.loadTables([projectsTable]));
    syncDispatch(spaceDB, seedProjects({}));

    spyOn(databases, "getMainHyperDB").mockImplementation(async () => mainDB);
    spyOn(databases, "getHyperDB").mockImplementation(async (config) =>
      config.dbType === "user"
        ? ({ db: userDB } as unknown as ReturnType<typeof databases.getHyperDB>)
        : ({
            db: spaceDB,
          } as unknown as ReturnType<typeof databases.getHyperDB>),
    );
    const projects = await listSpaceProjects({
      spaceId: "space-1",
      userId: "user-1",
    });

    expect(projects).toEqual([
      {
        id: "first",
        title: "First",
        icon: "1",
        isInbox: true,
        createdAt: 100,
      },
      {
        id: "second",
        title: "Second",
        icon: "2",
        isInbox: false,
        createdAt: 200,
      },
    ]);

    expect(
      listSpaceProjects({ spaceId: "space-1", userId: "another-user" }),
    ).rejects.toThrow(DatabaseAccessDeniedError);
  });

  test("registers database access for an authorized unregistered space", async () => {
    const mainDB = new DB(new BptreeInmemDriver());
    const userDB = new DB(new BptreeInmemDriver());
    const spaceDB = new DB(new BptreeInmemDriver());
    execSync(mainDB.loadTables([dbsTable]));
    execSync(userDB.loadTables([spacesTable]));
    syncDispatch(userDB, seedSpaceMembership({}));
    execSync(spaceDB.loadTables([projectsTable]));
    syncDispatch(spaceDB, seedProjects({}));

    spyOn(databases, "getMainHyperDB").mockImplementation(async () => mainDB);
    spyOn(databases, "getHyperDB").mockImplementation(async (config) =>
      config.dbType === "user"
        ? ({ db: userDB } as unknown as ReturnType<typeof databases.getHyperDB>)
        : ({ db: spaceDB } as unknown as ReturnType<
            typeof databases.getHyperDB
          >),
    );

    expect(
      await listSpaceProjects({ spaceId: "space-1", userId: "user-1" }),
    ).toHaveLength(2);
    expect(
      selectSync(mainDB, {
        selector: getDbById,
        args: { id: "space-1", type: "space" },
      }),
    ).toMatchObject({ id: "space-1", userId: "user-1" });
  });

  test("does not let a user claim an unknown unregistered space", async () => {
    const mainDB = new DB(new BptreeInmemDriver());
    const userDB = new DB(new BptreeInmemDriver());
    const spaceDB = new DB(new BptreeInmemDriver());
    execSync(mainDB.loadTables([dbsTable]));
    execSync(userDB.loadTables([spacesTable]));
    execSync(spaceDB.loadTables([projectsTable]));

    spyOn(databases, "getMainHyperDB").mockImplementation(async () => mainDB);
    spyOn(databases, "getHyperDB").mockImplementation(async (config) =>
      config.dbType === "user"
        ? ({ db: userDB } as unknown as ReturnType<typeof databases.getHyperDB>)
        : ({
            db: spaceDB,
          } as unknown as ReturnType<typeof databases.getHyperDB>),
    );

    expect(
      listSpaceProjects({
        spaceId: "unknown-space",
        userId: "user-1",
      }),
    ).rejects.toThrow(ResourceNotFoundError);
  });
});
