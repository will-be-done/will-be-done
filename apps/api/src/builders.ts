import { createAction, createSelector } from "@will-be-done/hyperdb";
import { hyperDBStrict } from "@will-be-done/slices";

export const selector = createSelector({ validateArgs: hyperDBStrict });
export const action = createAction({ validateArgs: hyperDBStrict });
