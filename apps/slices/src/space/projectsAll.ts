import { runQuery, selectFrom, selector } from "@will-be-done/hyperdb";
import { projectsSlice } from ".";
import { type Project, projectsTable, defaultProject } from "./projects";

export const all = selector(function* () {
  const projects = yield* runQuery(selectFrom(projectsTable, "byOrderToken"));
  return projects;
});

export const allSorted = selector(function* () {
  const projects = yield* runQuery(selectFrom(projectsTable, "byOrderToken"));
  return projects;
});

export const childrenIds = selector(function* () {
  return (yield* allSorted()).map((p) => p.id);
});

export const childrenIdsWithoutInbox = selector(function* () {
  const projects = yield* allSorted();
  return projects.filter((p) => !p.isInbox).map((p) => p.id);
});

export const firstChild = selector(function* () {
  const ids = yield* childrenIds();
  const firstChildId = ids[0];
  return firstChildId ? yield* projectsSlice.byId(firstChildId) : undefined;
});

export const lastChild = selector(function* () {
  const ids = yield* childrenIds();
  const lastChildId = ids[ids.length - 1];
  return lastChildId ? yield* projectsSlice.byId(lastChildId) : undefined;
});

export const inbox = selector(function* () {
  return (
    (yield* projectsSlice.byId(yield* projectsSlice.inboxProjectId())) ||
    defaultProject
  );
});

export const siblings = selector(function* (projectId: string) {
  const ids = yield* childrenIds();
  const index = ids.findIndex((id) => id === projectId);

  if (index === -1)
    return [undefined, undefined] as [Project | undefined, Project | undefined];

  const beforeId = index > 0 ? ids[index - 1] : undefined;
  const afterId = index < ids.length - 1 ? ids[index + 1] : undefined;

  const before = beforeId ? yield* projectsSlice.byId(beforeId) : undefined;
  const after = afterId ? yield* projectsSlice.byId(afterId) : undefined;

  return [before, after] as [Project | undefined, Project | undefined];
});

export const dropdownProjectsList = selector(function* () {
  const projects = yield* allSorted();
  return projects.map((p) => {
    return { value: p.id, label: p.title };
  });
});
