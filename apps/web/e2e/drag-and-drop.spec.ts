import {
  expect,
  test,
  type JSHandle,
  type Locator,
  type Page,
} from "playwright/test";
import {
  createSpace,
  createTodayTask,
  openSpace,
  signupUser,
  taskItem,
  uniqueE2EName,
} from "./helpers";

async function dragOver(target: Locator, dataTransfer: JSHandle<DataTransfer>) {
  const box = await target.boundingBox();
  if (!box) throw new Error("Drop target has no bounding box");
  await target.dispatchEvent("dragover", {
    dataTransfer,
    clientX: box.x + box.width / 2,
    clientY: box.y + 5,
  });
}

async function startDrag(page: Page, source: Locator) {
  await expect(source).toHaveAttribute("draggable", "true");
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent("dragstart", { dataTransfer });
  return dataTransfer;
}

test("shows a row indicator only for an eligible drop, then reorders the task", async ({
  page,
}) => {
  await signupUser(page);
  const spaceName = uniqueE2EName("DnD Space");
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);
  const sourceTitle = uniqueE2EName("Drag source");
  const targetTitle = uniqueE2EName("Todo target");
  const doneTitle = uniqueE2EName("Done target");
  await createTodayTask(page, sourceTitle);
  await createTodayTask(page, targetTitle);
  const done = await createTodayTask(page, doneTitle);
  await done.getByRole("checkbox").first().click();
  await expect(done).toHaveAttribute("data-ignore-drop", "true");

  const source = taskItem(page, sourceTitle);
  const target = taskItem(page, targetTitle);
  const column = page.locator(
    '[data-focus-column][data-column-model-type="dailyList"]',
  );
  const rows = page.locator(
    '[data-focus-column][data-column-model-type="dailyList"] [data-focusable-key^="dailyEntry^^"]',
  );
  await expect(rows.nth(0)).toContainText(targetTitle);
  await expect(rows.nth(1)).toContainText(sourceTitle);
  const dataTransfer = await startDrag(page, source);

  await dragOver(target, dataTransfer);
  await expect(
    target.locator("..").locator('[data-drop-indicator="top"]'),
  ).toBeVisible();
  await expect(column).not.toHaveAttribute("data-drop-active", "true");

  await dragOver(done, dataTransfer);
  await expect(
    target.locator("..").locator("[data-drop-indicator]"),
  ).toHaveCount(0);
  await expect(done.locator("..").locator("[data-drop-indicator]")).toHaveCount(
    0,
  );
  await expect(column).toHaveAttribute("data-drop-active", "true");

  await dragOver(target, dataTransfer);
  await expect(
    target.locator("..").locator('[data-drop-indicator="top"]'),
  ).toBeVisible();
  await target.dispatchEvent("drop", { dataTransfer });
  await expect(
    target.locator("..").locator("[data-drop-indicator]"),
  ).toHaveCount(0);
  await expect(column).not.toHaveAttribute("data-drop-active", "true");
  await expect(done).toHaveAttribute("data-ignore-drop", "true");

  await expect(rows.nth(0)).toContainText(sourceTitle);
  await expect(rows.nth(1)).toContainText(targetTitle);
  await dataTransfer.dispose();
});

test("does not show a done source as droppable on a todo row or daily column", async ({
  page,
}) => {
  await signupUser(page);
  const spaceName = uniqueE2EName("Rejected DnD Space");
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);
  const targetTitle = uniqueE2EName("Todo target");
  const doneTitle = uniqueE2EName("Done source");
  const target = await createTodayTask(page, targetTitle);
  const done = await createTodayTask(page, doneTitle);
  await done.getByRole("checkbox").first().click();
  await expect(done).toHaveAttribute("data-ignore-drop", "true");
  const beforeToken = await target.getAttribute("data-order-token");
  const dataTransfer = await startDrag(page, done);

  await dragOver(target, dataTransfer);
  await expect(
    target.locator("..").locator("[data-drop-indicator]"),
  ).toHaveCount(0);
  await expect(
    page.locator('[data-focus-column][data-column-model-type="dailyList"]'),
  ).not.toHaveAttribute("data-drop-active", "true");
  await target.dispatchEvent("drop", { dataTransfer });
  await expect(target).toHaveAttribute("data-order-token", beforeToken!);
  await expect(
    page
      .locator(
        '[data-focus-column][data-column-model-type="dailyList"] [data-focusable-key^="dailyEntry^^"]',
      )
      .nth(0),
  ).toContainText(targetTitle);
  await expect(done).toHaveAttribute("data-ignore-drop", "true");
  await dataTransfer.dispose();
});
