import { insert } from "./hyperdb/action";
import { selectFrom } from "./hyperdb/query";
import { runQuery, selector } from "./hyperdb/selector";
import { SubscribableDB } from "./hyperdb/subscribable-db";
import { table } from "./hyperdb/table";

export type Project = {
  type: "project";
  id: string;
  title: string;
  orderToken: string;
};
export const projectsTable = table<Project>("projects").withIndexes({
  ids: { cols: ["id"], type: "hash" },
  ordered: { cols: ["orderToken"], type: "btree" },
});

export const getAllProjects = selector(function* () {
  const tasks = yield* runQuery(
    selectFrom(projectsTable, "ordered").where((q) => q),
  );

  return tasks;
});

export const getFirst10ProjectsIds = selector(function* () {
  const tasks = yield* runQuery(
    selectFrom(projectsTable, "ordered", 10).where((q) => q),
  );

  return tasks.map((p) => p.id);
});

export const getById = selector(function* (id: string) {
  const tasks = yield* runQuery(
    selectFrom(projectsTable, "ids").where((q) => q.eq("id", id)),
  );

  return tasks[0];
});

export function* insertMillion() {
  const projects: Project[] = [];
  for (let i = 0; i < 1000000; i++) {
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

export const create = (db: SubscribableDB, project: Project) => {
  db.insert(projectsTable, [project]);
};

export const update = (db: SubscribableDB, project: Project) => {
  db.update(projectsTable, [project]);
};
