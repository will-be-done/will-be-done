import { createAction, createSelector } from "@will-be-done/hyperdb";

// Opt-in: the production API runs without NODE_ENV, so `!== "production"` would enable it there.
export const hyperDBStrict =
  process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";

export const hyperDBStrictOptions = {
  runtimeRowsValidation: hyperDBStrict,
  freezeArgs: hyperDBStrict,
  freezeRows: hyperDBStrict,
};

export const selector = createSelector({
  validateArgs: hyperDBStrict,
});

export const action = createAction({
  validateArgs: hyperDBStrict,
});
