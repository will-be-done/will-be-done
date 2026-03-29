import { asyncDispatch, insert } from "./hyperdb/action";
import { execAsync, type HyperDB } from "./hyperdb/db";
import { selectFrom } from "./hyperdb/query";
import { runQuery, selector } from "./hyperdb/selector";
import { table } from "./hyperdb/table";

export type Project = {
  type: "project";
  id: string;
  title: string;
  orderToken: string;
};
export const projectsTable = table<Project>("projects").withIndexes({
  byId: { cols: ["id"], type: "hash" },
  ordered: { cols: ["orderToken"], type: "btree" },
});

export const get100Projects = selector(function* () {
  const tasks = yield* runQuery(
    selectFrom(projectsTable, "ordered")
      .where((q) => q)
      .limit(10),
  );

  return tasks;
});

export const getFirst10ProjectsIds = selector(function* () {
  const tasks = yield* runQuery(
    selectFrom(projectsTable, "ordered")
      .where((q) => q)
      .limit(10),
  );

  return tasks.map((p) => p.id);
});

export const getById = selector(function* (id: string) {
  const tasks = yield* runQuery(
    selectFrom(projectsTable, "byId").where((q) => q.eq("id", id)),
  );

  return tasks[0];
});

export function* insertMillion() {
  const projects: Project[] = [];
  for (let i = 0; i < 10000; i++) {
    const id = Math.random().toString(36).slice(2);
    projects.push({
      id: id,
      title: "Project 1" + id,
      orderToken: id,
      type: "project",
    });
  }

  yield* insert(projectsTable, projects);

  console.log("new", yield* getFirst10ProjectsIds());
}

export const create = (db: HyperDB, project: Project) => {
  return asyncDispatch(db, insert(projectsTable, [project]));
};

export const update = async (db: HyperDB, project: Project) => {
  await execAsync(db.update(projectsTable, [project]));
};
