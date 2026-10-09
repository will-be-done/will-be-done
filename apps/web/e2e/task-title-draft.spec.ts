import { expect, test } from "playwright/test";

test("uses the title draft only while it belongs to the current task and source", async ({
  page,
}) => {
  await page.goto("/login");
  const snapshots = await page.evaluate(async (modulePath) => {
    const { checkDraftOwnership } = await import(modulePath);
    return checkDraftOwnership();
  }, "/src/hooks/useDebouncedPersistedDraft.browser.test.ts");

  expect(snapshots).toEqual({
    pending: { draft: "Edited", displayed: "Edited" },
    acknowledged: { draft: "Edited", displayed: "Edited" },
    external: { draft: "Unsaved", displayed: "External update" },
    externalReverted: { draft: "Unsaved", displayed: "Edited" },
    beforeTaskChange: {
      draft: "Owned by task A",
      displayed: "Owned by task A",
    },
    differentTaskSameTitle: { draft: "Owned by task A", displayed: "Edited" },
    beforeFailure: { draft: "Failed edit", displayed: "Failed edit" },
    failed: { draft: "Failed edit", displayed: "Edited" },
    olderFailure: { draft: "Newer edit", displayed: "Newer edit" },
    differentTaskCleanDraft: {
      draft: "Task C title",
      displayed: "Task C title",
    },
  });
});
