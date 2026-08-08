import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { DB, execSync, selectSync } from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { spacesTable } from "@will-be-done/slices/user";
import * as databases from "../db/db";
import { dbsTable, getDbById } from "../slices/dbSlice";
import {
  createUserSpace,
  deleteUserSpace,
  getUserSpace,
  listUserSpaces,
  updateUserSpace,
} from "./spaces";

describe("space service", () => {
  afterEach(() => {
    mock.restore();
  });

  test("creates, updates, lists, and deletes spaces in the user's database", async () => {
    const userDB = new DB(new BptreeInmemDriver());
    const mainDB = new DB(new BptreeInmemDriver());
    execSync(userDB.loadTables([spacesTable]));
    execSync(mainDB.loadTables([dbsTable]));
    spyOn(databases, "getHyperDB").mockImplementation(
      () =>
        ({ db: userDB }) as unknown as ReturnType<typeof databases.getHyperDB>,
    );

    const created = await createUserSpace({
      userId: "user-1",
      name: "Personal",
      mainDB,
    });

    expect(created).toMatchObject({ name: "Personal" });
    expect(created).not.toHaveProperty("type");
    expect(
      await getUserSpace({ userId: "user-1", spaceId: created.id }),
    ).toEqual(created);
    expect(
      selectSync(mainDB, {
        selector: getDbById,
        args: { id: created.id, type: "space" },
      }),
    ).toMatchObject({ id: created.id, userId: "user-1" });
    expect(await listUserSpaces({ userId: "user-1" })).toEqual([created]);
    expect(
      await updateUserSpace({
        userId: "user-1",
        spaceId: created.id,
        name: "Renamed",
      }),
    ).toMatchObject({ id: created.id, name: "Renamed" });
    expect(
      await updateUserSpace({
        userId: "user-1",
        spaceId: "missing",
        name: "Missing",
      }),
    ).toBeNull();
    expect(
      await deleteUserSpace({ userId: "user-1", spaceId: created.id, mainDB }),
    ).toBe(true);
    expect(await listUserSpaces({ userId: "user-1" })).toEqual([]);
    expect(
      selectSync(mainDB, {
        selector: getDbById,
        args: { id: created.id, type: "space" },
      }),
    ).toBeUndefined();
    expect(
      await deleteUserSpace({ userId: "user-1", spaceId: created.id, mainDB }),
    ).toBe(false);
  });
});
