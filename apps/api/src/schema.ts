import {
  DummyDriver,
  type JSONColumnType,
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely";
import { BunWorkerDialect } from "kysely-bun-worker";
import { SerializePlugin } from "kysely-plugin-serialize";
import path from "path";

export const projectsTable = "projects";
export const tasksTable = "tasks";
export const taskTemplatesTable = "task_templates";
export const taskProjectionsTable = "task_projections";
export const dailyListsTable = "daily_lists";
export const migrationsTable = "migrations";

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
  date: number;
};

export type MigrationsTable = {
  id: string;
  name: string;
};

export type ProjectsTable = SyncableTable<ProjectData>;
export type TasksTable = SyncableTable<TaskData>;
export type TaskTemplatesTable = SyncableTable<TaskTemplateData>;
export type TaskProjectionsTable = SyncableTable<TaskProjectionData>;
export type DailyListsTable = SyncableTable<DailyListData>;

export interface SyncableTables {
  [projectsTable]: ProjectsTable;
  [tasksTable]: TasksTable;
  [taskTemplatesTable]: TaskTemplatesTable;
  [taskProjectionsTable]: TaskProjectionsTable;
  [dailyListsTable]: DailyListsTable;
}

export interface Database extends SyncableTables {
  [migrationsTable]: MigrationsTable;
}

let q: Kysely<Database> | undefined = undefined;
export const getQ = () => {
  if (q) return q;

  const dialect = new BunWorkerDialect({
    url: path.join(__dirname, "..", "dbs", "main.sqlite"),
  });

  q = new Kysely<Database>({
    dialect,
    plugins: [new SerializePlugin()],
  });

  return q;
};
