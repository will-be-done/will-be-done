import {
  createActionCreator,
  createSelectorCreator,
} from "@will-be-done/hyperstate";

import { RootState } from "@/store/store.ts";

export const appSelector = createSelectorCreator<RootState>();
export const appAction = createActionCreator<RootState>();
