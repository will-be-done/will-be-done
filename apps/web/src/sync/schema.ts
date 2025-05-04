import {
  DummyDriver,
  JSONColumnType,
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely";

export const projectsTable = "projects";
export const tasksTable = "tasks";
export const taskTemplatesTable = "task_templates";
export const taskProjectionsTable = "task_projections";
export const dailyListsTable = "daily_lists";
export const migrationsTable = "migrations";
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

export type ProjectData = {
  id: string;
  title: string;
  icon: string;
  isInbox: boolean;
  orderToken: string;
};

export type TaskData = {
  id: string;
  title: string;
  state: string;
  projectId: string;
  orderToken: string;
  lastToggledAt: number;
};

export type TaskTemplateData = {
  id: string;
  orderToken: string;
  projectId: string;
};

export type TaskProjectionData = {
  id: string;
  taskId: string;
  orderToken: string;
  dailyListId: string;
};

export type DailyListData = {
  id: string;
  date: string;
};

export type MigrationsTable = {
  id: string;
  name: string;
};

export type PreferencesTable = {
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

export interface Database extends SyncableTables {
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
