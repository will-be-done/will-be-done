import { describe, expect, test } from "bun:test";
import { DB, execSync, selectSync, type HyperDB } from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { spacesTable } from "@will-be-done/slices/user";
import { Effect, Layer } from "effect";
import { dbsTable, getDbById } from "../slices/dbSlice";
import { Databases } from "./databases";
import {
  createUserSpace,
  deleteUserSpace,
  getUserSpace,
  listUserSpaces,
  updateUserSpace,
} from "./spaces";

function setUpDatabases(space: (spaceId: string) => Effect.Effect<HyperDB>) {
  const userDB = new DB(new BptreeInmemDriver());
  const mainDB = new DB(new BptreeInmemDriver());
  execSync(userDB.loadTables([spacesTable]));
  execSync(mainDB.loadTables([dbsTable]));
  const layer = Layer.succeed(Databases, {
    main: Effect.succeed(mainDB),
    user: () => Effect.succeed(userDB),
    space,
  });
  const run = <A, E>(effect: Effect.Effect<A, E, Databases>) =>
    Effect.runPromise(effect.pipe(Effect.provide(layer)));
  return { mainDB, run };
}

describe("space service", () => {
  test("creates, updates, lists, and deletes spaces in the user's database", async () => {
    const { mainDB, run } = setUpDatabases(() =>
      Effect.succeed(new DB(new BptreeInmemDriver())),
    );

    const created = await run(
      createUserSpace({ userId: "user-1", name: "Personal" }),
    );

    expect(created).toMatchObject({ name: "Personal" });
    expect(created).not.toHaveProperty("type");
    expect(
      await run(getUserSpace({ userId: "user-1", spaceId: created.id })),
    ).toEqual(created);
    expect(
      selectSync(mainDB, {
        selector: getDbById,
        args: { id: created.id, type: "space" },
      }),
    ).toMatchObject({ id: created.id, userId: "user-1" });
    expect(await run(listUserSpaces({ userId: "user-1" }))).toEqual([created]);
    expect(
      await run(
        updateUserSpace({
          userId: "user-1",
          spaceId: created.id,
          name: "Renamed",
        }),
      ),
    ).toMatchObject({ id: created.id, name: "Renamed" });
    expect(
      await run(
        updateUserSpace({
          userId: "user-1",
          spaceId: "missing",
          name: "Missing",
        }),
      ),
    ).toBeNull();
    expect(
      await run(deleteUserSpace({ userId: "user-1", spaceId: created.id })),
    ).toBe(true);
    expect(await run(listUserSpaces({ userId: "user-1" }))).toEqual([]);
    expect(
      selectSync(mainDB, {
        selector: getDbById,
        args: { id: created.id, type: "space" },
      }),
    ).toBeUndefined();
    expect(
      await run(deleteUserSpace({ userId: "user-1", spaceId: created.id })),
    ).toBe(false);
  });

  test("rolls back the space when its database cannot be opened", async () => {
    const openFailure = new Error("space database unavailable");
    let spaceId = "";
    const { mainDB, run } = setUpDatabases((id) => {
      spaceId = id;
      return Effect.die(openFailure);
    });

    expect(
      await run(createUserSpace({ userId: "user-1", name: "Personal" })).catch(
        (error: unknown) => error,
      ),
    ).toBe(openFailure);
    expect(spaceId).not.toBe("");
    expect(await run(listUserSpaces({ userId: "user-1" }))).toEqual([]);
    expect(
      selectSync(mainDB, {
        selector: getDbById,
        args: { id: spaceId, type: "space" },
      }),
    ).toBeUndefined();
  });
});
