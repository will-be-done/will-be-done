import { createSlice } from "@will-be-done/hyperstate";
import { shallowEqual } from "fast-equals";
import { fractionalCompare } from "@/store/order.ts";
import {
  inboxId,
  Project,
  projectsSlice,
} from "@/store/slices/projectsSlice.ts";
import { appQuerySelector, appSelector } from "@/store/z.selectorAction.ts";

export const allProjectsSlice = createSlice(
  {
    byIds: appSelector((state) => {
      return state.project.byIds;
    }),
    byId: appSelector((state, id: string) => {
      return state.project.byIds[id];
    }),
    all: appSelector((state): Project[] => {
      const byIds = allProjectsSlice.byIds(state);

      return Object.values(byIds);
    }),
    allSorted: appSelector((state): Project[] => {
      const all = allProjectsSlice.all(state);

      return all.sort(fractionalCompare);
    }),
    childrenIds: appSelector((state): string[] => {
      const all = allProjectsSlice.all(state);

      const allIdsAndTokens = all.map((p) => ({
        id: p.id,
        orderToken: p.orderToken,
      }));

      return allIdsAndTokens.sort(fractionalCompare).map((p) => p.id);
    }, shallowEqual),
    childrenIdsWithoutInbox: appSelector((state): string[] => {
      const childrenIds = allProjectsSlice.childrenIds(state);

      return childrenIds.filter((id) => id !== inboxId);
    }, shallowEqual),
    firstChild: appSelector((state): Project | undefined => {
      const childrenIds = allProjectsSlice.childrenIds(state);
      const firstChildId = childrenIds[0];

      return firstChildId ? projectsSlice.byId(state, firstChildId) : undefined;
    }),
    lastChild: appSelector((state): Project | undefined => {
      const childrenIds = allProjectsSlice.childrenIds(state);
      const lastChildId = childrenIds[childrenIds.length - 1];

      return lastChildId ? projectsSlice.byId(state, lastChildId) : undefined;
    }),
    inbox: appSelector((state): Project => {
      const inbox = projectsSlice.byId(state, inboxId);
      if (!inbox) throw new Error("Inbox not found");
      return inbox;
    }),

    siblings: appQuerySelector(
      (
        query,
        projectId: string,
      ): [Project | undefined, Project | undefined] => {
        const items = query((state) => allProjectsSlice.childrenIds(state));
        const i = items.findIndex((it: string) => it === projectId);

        const beforeId = items[i - 1];
        const afterId = items[i + 1];

        return [
          beforeId
            ? query((state) => projectsSlice.byId(state, beforeId))
            : undefined,
          afterId
            ? query((state) => projectsSlice.byId(state, afterId))
            : undefined,
        ];
      },
    ),

    // TODO: move to allProjectsSlice
    dropdownProjectsList: appQuerySelector(
      (query): { value: string; label: string }[] => {
        const projects = query((state) => allProjectsSlice.childrenIds(state));
        return projects.map((id) => {
          const project = query((state) => projectsSlice.byId(state, id));
          if (!project) return { value: id, label: "" };

          return { value: id, label: project.title };
        });
      },
    ),
  },
  "allProjectsSlice",
);
