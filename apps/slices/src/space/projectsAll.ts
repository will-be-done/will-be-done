import { runQuery, selectFrom, selector } from "@will-be-done/hyperdb";
import type { GenReturn } from "./utils";
import {
  projectsSlice,
  type Project,
  projectsTable,
  defaultProject,
} from "./projects";

// Slice
export const projectsAllSlice = {
  all: selector(function* (): GenReturn<Project[]> {
    const projects = yield* runQuery(selectFrom(projectsTable, "byOrderToken"));
    return projects;
  }),
  allSorted: selector(function* (): GenReturn<Project[]> {
    const projects = yield* runQuery(selectFrom(projectsTable, "byOrderToken"));
    return projects;
  }),
  childrenIds: selector(function* (): GenReturn<string[]> {
    return (yield* projectsAllSlice.allSorted()).map((p) => p.id);
  }),
  childrenIdsWithoutInbox: selector(function* (): GenReturn<string[]> {
    const projects = yield* projectsAllSlice.allSorted();
    return projects.filter((p) => !p.isInbox).map((p) => p.id);
  }),
  firstChild: selector(function* (): GenReturn<Project | undefined> {
    const childrenIds = yield* projectsAllSlice.childrenIds();
    const firstChildId = childrenIds[0];
    return firstChildId ? yield* projectsSlice.byId(firstChildId) : undefined;
  }),
  lastChild: selector(function* (): GenReturn<Project | undefined> {
    const childrenIds = yield* projectsAllSlice.childrenIds();
    const lastChildId = childrenIds[childrenIds.length - 1];
    return lastChildId ? yield* projectsSlice.byId(lastChildId) : undefined;
  }),
  inbox: selector(function* (): GenReturn<Project> {
    const projects = yield* runQuery(
      selectFrom(projectsTable, "byIsInbox")
        .where((q) => q.eq("isInbox", true))
        .limit(1),
    );
    return projects[0] || defaultProject;
  }),
  siblings: selector(function* (
    projectId: string,
  ): GenReturn<[Project | undefined, Project | undefined]> {
    const childrenIds = yield* projectsAllSlice.childrenIds();
    const index = childrenIds.findIndex((id) => id === projectId);

    if (index === -1) return [undefined, undefined];

    const beforeId = index > 0 ? childrenIds[index - 1] : undefined;
    const afterId =
      index < childrenIds.length - 1 ? childrenIds[index + 1] : undefined;

    const before = beforeId ? yield* projectsSlice.byId(beforeId) : undefined;
    const after = afterId ? yield* projectsSlice.byId(afterId) : undefined;

    return [before, after];
  }),
  dropdownProjectsList: selector(function* (): GenReturn<
    { value: string; label: string }[]
  > {
    const projects = yield* projectsAllSlice.allSorted();
    return projects.map((p) => {
      return { value: p.id, label: p.title };
    });
  }),
};
