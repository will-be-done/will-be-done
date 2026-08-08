import { action, selector } from "../builders";
import {
  entryStorageMigrationTables,
  isEntryIdentityMigrationApplied,
  isEntryStorageMigrationApplied,
  migrateEntryIdentity,
  migrateLegacyEntries,
} from "./entryStorageMigration";
import {
  isProjectSectionStorageMigrationApplied,
  migrateLegacyProjectSections,
  projectSectionStorageMigrationTables,
} from "./projectSectionStorageMigration";

export const spaceStorageMigrationTables = [
  ...projectSectionStorageMigrationTables,
  ...entryStorageMigrationTables.filter(
    (entryTable) =>
      !projectSectionStorageMigrationTables.some(
        (projectSectionTable) =>
          projectSectionTable.tableName === entryTable.tableName,
      ),
  ),
];

export const areSpaceStorageMigrationsApplied = selector({
  name: "areSpaceStorageMigrationsApplied",
  args: {},
  handler: function* areSpaceStorageMigrationsApplied() {
    return (
      (yield* isProjectSectionStorageMigrationApplied({})) &&
      (yield* isEntryStorageMigrationApplied({})) &&
      (yield* isEntryIdentityMigrationApplied({}))
    );
  },
});

export const migrateLegacySpaceStorage = action({
  name: "migrateLegacySpaceStorage",
  args: {},
  handler: function* migrateLegacySpaceStorage() {
    yield* migrateLegacyProjectSections({});
    yield* migrateLegacyEntries({});
    yield* migrateEntryIdentity({});
  },
});
