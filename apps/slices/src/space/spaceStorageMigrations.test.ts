import { describe, expect, it } from "vitest";
import {
  createSelector,
  DB,
  execSync,
  selectFrom,
  selectSync,
  syncDispatch,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import {
  areSpaceStorageMigrationsApplied,
  migrateLegacySpaceStorage,
  spaceStorageMigrationTables,
} from "./spaceStorageMigrations";
import { spaceMigrationsTable } from "./tables";

const selector = createSelector();

const appliedMigrationIds = selector({
  name: "appliedMigrationIds",
  args: {},
  handler: function* appliedMigrationIds() {
    return (yield* selectFrom(spaceMigrationsTable, "byIds")).map(
      (migration) => migration.id,
    );
  },
});

describe("space storage migrations", () => {
  it("loads each physical table once and applies every migration", () => {
    expect(
      new Set(spaceStorageMigrationTables.map((table) => table.tableName)).size,
    ).toBe(spaceStorageMigrationTables.length);

    const db = new DB(new BptreeInmemDriver());
    execSync(db.loadTables(spaceStorageMigrationTables));
    syncDispatch(db, migrateLegacySpaceStorage({}));

    expect(
      selectSync(db, {
        selector: areSpaceStorageMigrationsApplied,
        args: {},
      }),
    ).toBe(true);
    expect(selectSync(db, { selector: appliedMigrationIds, args: {} })).toEqual(
      ["entry-identity-v2", "entry-storage-v1", "project-section-storage-v1"],
    );
  });
});
