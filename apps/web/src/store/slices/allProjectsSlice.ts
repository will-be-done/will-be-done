import {createSlice} from "@will-be-done/hyperstate";
import {inboxId, Project} from "@/store/models.ts";
import {shallowEqual} from "fast-equals";
import {fractionalCompare} from "@/store/order.ts";
import {projectsSlice} from "@/store/slices/projectsSlice.ts";
import {appSelector} from "@/store/selectorAction.ts";

export const allProjectsSlice = createSlice(
    {
        all: appSelector((query): Project[] => {
            const byIds = query((state) => state.project.byIds);

            return Object.values(byIds);
        }, shallowEqual),
        allSorted: appSelector((query): Project[] => {
            const all = query((state) => allProjectsSlice.all(state));

            return all.sort(fractionalCompare);
        }, shallowEqual),
        childrenIds: appSelector((query): string[] => {
            const all = query((state) => allProjectsSlice.all(state));

            const allIdsAndTokens = all.map((p) => ({
                id: p.id,
                orderToken: p.orderToken,
            }));
            return allIdsAndTokens.sort(fractionalCompare).map((p) => p.id);
        }, shallowEqual),
        childrenIdsWithoutInbox: appSelector((query): string[] => {
            const childrenIds = query((state) => allProjectsSlice.childrenIds(state));

            return childrenIds.filter((id) => id !== inboxId);
        }, shallowEqual),
        firstChild: appSelector((query): Project | undefined => {
            const childrenIds = query((state) => allProjectsSlice.childrenIds(state));
            const firstChildId = childrenIds[0];

            return firstChildId
                ? query((state) => projectsSlice.byId(state, firstChildId))
                : undefined;
        }),
        lastChild: appSelector((query): Project | undefined => {
            return query((state) => {
                const childrenIds = allProjectsSlice.childrenIds(state);
                const lastChildId = childrenIds[childrenIds.length - 1];

                return lastChildId ? projectsSlice.byId(state, lastChildId) : undefined;
            });
        }),
        inbox: appSelector((query): Project => {
            return query((state) => {
                const inbox = projectsSlice.byId(state, inboxId);
                if (!inbox) throw new Error("Inbox not found");
                return inbox;
            });
        }),
    },
    "allProjectsSlice",
);