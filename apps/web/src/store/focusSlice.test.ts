import { expect, it } from "vitest";
import { useFocusStore } from "./focusSlice.ts";

it("keeps shortcuts disabled until every overlay enables them again", () => {
  const { disableFocus, enableFocus } = useFocusStore.getState();

  disableFocus();
  disableFocus();
  enableFocus();
  expect(useFocusStore.getState().isFocusDisabled).toBe(true);

  enableFocus();
  expect(useFocusStore.getState().isFocusDisabled).toBe(false);
});
