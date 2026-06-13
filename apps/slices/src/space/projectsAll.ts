import { selectFrom, selector } from "@will-be-done/hyperdb-lib";
import {
  inboxProjectId,
  projectById,
} from "./projects";
import { type Project, projectsTable, defaultProject } from "./projects";

export const allProjects = selector(function* allProjects() {
  const projects = yield* selectFrom(projectsTable, "byOrderToken");
  return projects;
});

export const allProjectsSorted = selector(function* allProjectsSorted() {
  const projects = yield* selectFrom(projectsTable, "byOrderToken");
  return projects;
});

export const projectChildrenIds = selector(function* projectChildrenIds() {
  return (yield* allProjectsSorted()).map((p) => p.id);
});

export const projectChildrenIdsWithoutInbox = selector(function* projectChildrenIdsWithoutInbox() {
  const projects = yield* allProjectsSorted();
  return projects.filter((p) => !p.isInbox).map((p) => p.id);
});

export const firstProjectChild = selector(function* firstProjectChild() {
  const ids = yield* projectChildrenIds();
  const firstChildId = ids[0];
  return firstChildId ? yield* projectById(firstChildId) : undefined;
});

export const lastProjectChild = selector(function* lastProjectChild() {
  const ids = yield* projectChildrenIds();
  const lastChildId = ids[ids.length - 1];
  return lastChildId ? yield* projectById(lastChildId) : undefined;
});

export const inboxProject = selector(function* inboxProject() {
  return (
    (yield* projectById(yield* inboxProjectId())) ||
    defaultProject
  );
});

export const projectSiblings = selector(function* projectSiblings(projectId: string) {
  const ids = yield* projectChildrenIds();
  const index = ids.findIndex((id) => id === projectId);

  if (index === -1)
    return [undefined, undefined] as [Project | undefined, Project | undefined];

  const beforeId = index > 0 ? ids[index - 1] : undefined;
  const afterId = index < ids.length - 1 ? ids[index + 1] : undefined;

  const before = beforeId ? yield* projectById(beforeId) : undefined;
  const after = afterId ? yield* projectById(afterId) : undefined;

  return [before, after] as [Project | undefined, Project | undefined];
});

export const dropdownProjectsList = selector(function* dropdownProjectsList() {
  const projects = yield* allProjectsSorted();
  return projects.map((p) => {
    return { value: p.id, label: p.title };
  });
});
