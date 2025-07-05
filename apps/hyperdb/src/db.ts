import { DB, table } from "./hyperdb/db";
import { InmemDriver } from "./hyperdb/drivers/InmemDriver";
import { selectEqual, selectRange, selector } from "./hyperdb/selector";
import { SubscribableDB } from "./hyperdb/subscribable-db";

export type Project = {
  type: "project";
  id: string;
  title: string;
  orderToken: string;
};
export const projectsTable = table<Project>("projects", {
  ids: { col: "id", type: "equal" },
  ordered: { cols: ["orderToken"], type: "range" },
});

export const getAllProjects = selector(function* () {
  const tasks = yield* selectRange(projectsTable, "ordered");

  return tasks;
});

export const getFirst10ProjectsIds = selector(function* () {
  const tasks = yield* selectRange(projectsTable, "ordered", { limit: 10 });

  return tasks.map((p) => p.id);
});

export const getById = selector(function* (id: string) {
  const tasks = yield* selectEqual(projectsTable, "ids", [id]);

  return tasks[0];
});

export const insertMillion = (db: SubscribableDB) => {
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

  db.insert(projectsTable, projects);
};

export const create = (db: SubscribableDB, project: Project) => {
  db.insert(projectsTable, [project]);
};

export const update = (db: SubscribableDB, project: Project) => {
  db.update(projectsTable, [project]);
};
