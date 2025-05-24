import {dailyListType, projectionType, projectType, RootState, taskType} from "@/store/models.ts";
import {tasksSlice} from "@/store/slices/tasksSlice.ts";
import {projectionsSlice} from "@/store/slices/projectionsSlice.ts";
import {dailyListsSlice} from "@/store/slices/dailyListsSlice.ts";
import {projectsSlice} from "@/store/slices/projectsSlice.ts";
import {createSlice} from "@will-be-done/hyperstate";
import {appSlice} from "@/store/slices/appSlice.ts";
import {shouldNeverHappen} from "@/utils.ts";

import {appAction} from "@/store/selectorAction.ts";

const handleDropsByType = {
    [taskType]: tasksSlice.handleDrop,
    [projectionType]: projectionsSlice.handleDrop,
    [dailyListType]: dailyListsSlice.handleDrop,
    [projectType]: projectsSlice.handleDrop,
};
const canDropsByType = {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    [taskType]: tasksSlice.canDrop,
    // eslint-disable-next-line @typescript-eslint/unbound-method
    [projectionType]: projectionsSlice.canDrop,
    // eslint-disable-next-line @typescript-eslint/unbound-method
    [dailyListType]: dailyListsSlice.canDrop,
    // eslint-disable-next-line @typescript-eslint/unbound-method
    [projectType]: projectsSlice.canDrop,
};
export const dropSlice = createSlice(
    {
        canDrop: (state: RootState, id: string, targetId: string) => {
            const model = appSlice.byId(state, id);
            if (!model) return false;

            const canDropFunction =
                canDropsByType[model.type as keyof typeof canDropsByType];
            if (!canDropFunction)
                return shouldNeverHappen("Drop type not found" + model.type);

            return canDropFunction(state, id, targetId);
        },
        handleDrop: appAction(
            (
                state: RootState,
                id: string,
                dropId: string,
                edge: "top" | "bottom",
            ) => {
                const model = appSlice.byId(state, id);
                if (!model) return;

                const dropFunction =
                    handleDropsByType[model.type as keyof typeof handleDropsByType];
                if (!dropFunction)
                    return shouldNeverHappen("Drop type not found" + model.type);

                return dropFunction(state, id, dropId, edge);
            },
        ),
    },
    "dropSlice",
);