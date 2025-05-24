import {
  DummyDriver,
  JSONColumnType,
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely";
import { ProjectData, projectsTable } from "@/store/slices/projectsSlice.ts";
import { TaskData, tasksTable } from "@/store/slices/tasksSlice.ts";
import {
  TaskTemplateData,
  taskTemplatesTable,
} from "@/store/slices/taskTemplatesSlice.ts";
import {
  TaskProjectionData,
  taskProjectionsTable,
} from "@/store/slices/projectionsSlice.ts";
import {
  DailyListData,
  dailyListsTable,
} from "@/store/slices/dailyListsSlice.ts";

const migrationsTable = "migrations";
export const preferencesTable = "preferences";

export const syncableTables = [
  projectsTable,
  tasksTable,
  taskTemplatesTable,
  taskProjectionsTable,
  dailyListsTable,
] as const;

export type SyncableTable<T extends object | null = object> = {
  id: string;
  needSync: number;
  lastUpdatedOnClientAt: string;
  lastUpdatedOnServerAt: string;
  isDeleted: number;
  data: JSONColumnType<T>;
};

type MigrationsTable = {
  id: string;
  name: string;
};

type PreferencesTable = {
  key: string;
  value: string;
};

type ProjectsTable = SyncableTable<ProjectData>;
type TasksTable = SyncableTable<TaskData>;
type TaskTemplatesTable = SyncableTable<TaskTemplateData>;
type TaskProjectionsTable = SyncableTable<TaskProjectionData>;
type DailyListsTable = SyncableTable<DailyListData>;

export interface SyncableTables {
  [projectsTable]: ProjectsTable;
  [tasksTable]: TasksTable;
  [taskTemplatesTable]: TaskTemplatesTable;
  [taskProjectionsTable]: TaskProjectionsTable;
  [dailyListsTable]: DailyListsTable;
}

interface Database extends SyncableTables {
  [migrationsTable]: MigrationsTable;
  [preferencesTable]: PreferencesTable;
}

export const Q = new Kysely<Database>({
  dialect: {
    createAdapter() {
      return new SqliteAdapter();
    },
    createDriver() {
      return new DummyDriver();
    },
    createIntrospector(db: Kysely<Database>) {
      return new SqliteIntrospector(db);
    },
    createQueryCompiler() {
      return new SqliteQueryCompiler();
    },
  },
});
