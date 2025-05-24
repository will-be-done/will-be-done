import { replaceSlices } from "@will-be-done/hyperstate";
import { taskBoxesSlice } from "@/store/slices/taskBoxesSlice.ts";
import { appSlice } from "@/store/slices/appSlice.ts";
import { dailyListsSlice } from "@/store/slices/dailyListsSlice.ts";
import { projectionsSlice } from "@/store/slices/projectionsSlice.ts";
import { tasksSlice } from "@/store/slices/tasksSlice.ts";
import { allProjectsSlice } from "@/store/slices/allProjectsSlice.ts";
import { projectsSlice } from "@/store/slices/projectsSlice.ts";
import { dropSlice } from "@/store/slices/dropSlice.ts";
import { focusSlice } from "@/store/slices/focusSlice.ts";

export const allSlices = {
  appSlice,
  taskBoxesSlice,
  dailyListsSlice,
  projectionsSlice,
  tasksSlice,
  allProjectsSlice,
  projectsSlice,
  dropSlice,
  focusSlice,
};

if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    if (newModule) {
      const newAllSlices: typeof allSlices = newModule.allSlices;

      replaceSlices("allSlices", allSlices, newAllSlices);
    }
  });
}
