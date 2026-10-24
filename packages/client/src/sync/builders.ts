import { createAction, createSelector } from "@will-be-done/hyperdb";

export const selector = createSelector({
  validateArgs: false,
});
export const action = createAction({
  validateArgs: false,
});
