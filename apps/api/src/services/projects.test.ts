import { describe, expect, test } from "bun:test";
import {
  createAction,
  DB,
  execSync,
  insert,
  selectSync,
  syncDispatch,
  type HyperDB,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import {
  projectType,
  projectsTable,
  type Project,
} from "@will-be-done/slices/space";
import { dbsTable, getDbById, getDbByIdOrCreate } from "../slices/dbSlice";
import { spacesTable, spacesTableType } from "@will-be-done/slices/user";
import { Effect, Layer } from "effect";
import { Databases } from "./databases";
import { DatabaseAccessDeniedError, ResourceNotFoundError } from "./errors";
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

function runner(mainDB: HyperDB, userDB: HyperDB, spaceDB: HyperDB) {
  const layer = Layer.succeed(Databases, {
    main: Effect.succeed(mainDB),
    user: () => Effect.succeed(userDB),
    space: () => Effect.succeed(spaceDB),
  });
  return <A, E>(effect: Effect.Effect<A, E, Databases>) =>
    Effect.runPromise(effect.pipe(Effect.provide(layer)));
}

describe("listSpaceProjects", () => {
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

    const run = runner(mainDB, userDB, spaceDB);
    const projects = await run(
      listSpaceProjects({
        spaceId: "space-1",
        userId: "user-1",
      }),
    );

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
      run(listSpaceProjects({ spaceId: "space-1", userId: "another-user" })),
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

    const run = runner(mainDB, userDB, spaceDB);

    expect(
      await run(listSpaceProjects({ spaceId: "space-1", userId: "user-1" })),
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

    const run = runner(mainDB, userDB, spaceDB);

    expect(
      run(
        listSpaceProjects({
          spaceId: "unknown-space",
          userId: "user-1",
        }),
      ),
    ).rejects.toThrow(ResourceNotFoundError);
  });
});
