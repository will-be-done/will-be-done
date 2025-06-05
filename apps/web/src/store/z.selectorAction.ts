import {
  createActionCreator,
  createQuerySelectorCreator,
} from "@will-be-done/hyperstate";

import { RootState } from "@/store/store.ts";

export const appQuerySelector = createQuerySelectorCreator<RootState>();
export const appAction = createActionCreator<RootState>();
