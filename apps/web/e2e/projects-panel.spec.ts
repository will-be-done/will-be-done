import { expect, test, type Page } from "playwright/test";

import {
  createProject,
  createSpace,
  createTodayTask,
  dailyTaskItem,
  openSpace,
  signupUser,
  uniqueE2EName,
  waitForSyncedText,
} from "./helpers";

test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

async function swipe(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const cdp = await page.context().newCDPSession(page);
  const touch = (
    type: "touchStart" | "touchMove" | "touchEnd",
    points: { x: number; y: number }[],
  ) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: points.map(({ x, y }, id) => ({ x, y, id })),
    });
  await touch("touchStart", [from]);
  for (let step = 1; step <= 5; step++) {
    await touch("touchMove", [
      {
        x: from.x + ((to.x - from.x) * step) / 5,
        y: from.y + ((to.y - from.y) * step) / 5,
      },
    ]);
  }
  await touch("touchEnd", []);
}

const centerOf = async (page: Page, name: string, nth = 0) => {
  const box = (await page
    .getByRole("button", { name, exact: true })
    .nth(nth)
    .boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
};

test("on a phone the projects list folds away and both panels resize by touch", async ({
  page,
}) => {
  const spaceName = uniqueE2EName("E2E Projects Panel Space");
  // The project is made at desktop size, where the sidebar stays open.
  await page.setViewportSize({ width: 1280, height: 800 });
  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);
  const synced = Promise.all([
    waitForSyncedText(page, "Work"),
    waitForSyncedText(page, "Plan week"),
  ]);
  // Before the project, which opens its own page.
  await createTodayTask(page, "Plan week");
  await createProject(page, "Work");
  // The reload starts the list with its phone default, folded.
  await synced;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  // Phones reach the other views from the sidebar.
  await page.getByRole("button", { name: "Toggle Sidebar" }).first().tap();
  await page.getByRole("link", { name: "Timeline", exact: true }).tap();
  await expect(page).toHaveURL(/\/timeline/);

  // A phone starts with the list folded to the selected project. Taps come
  // before swipes: a tap right after a swipe stops the fling instead.
  const rail = page.getByRole("button", { name: "Show projects" });
  const fold = page.getByRole("button", { name: "Hide projects" });
  await expect(rail).toContainText("Inbox");
  // Phones open item details full screen, not in a side panel.
  await expect(page.getByTestId("item-details-panel")).toBeHidden();
  await dailyTaskItem(page, "Plan week").tap();
  await page.getByRole("button", { name: "Task details" }).tap();
  await expect(page).toHaveURL(/\/item-details\//);
  await expect(page.getByRole("main")).toContainText("Plan week");
  await page.goBack();
  await expect(page).toHaveURL(/\/timeline/);
  await page.getByRole("button", { name: "Hide panel" }).tap();
  await page.getByRole("button", { name: "Show panel" }).tap();
  // Taps wait for the panel to settle, so the edges below are measured still.
  await rail.tap();
  await fold.tap();
  await rail.tap();
  // Picking a project folds the list, then opens the project.
  await page.getByRole("link", { name: "Work", exact: true }).tap();
  await expect(rail).toContainText("Work");
  await expect(page).toHaveURL(/\/timeline.*projectId=/);
  await rail.tap();
  // The list slides open; a trial tap waits until it stops moving.
  await fold.tap({ trial: true });

  // The list's left edge drags to resize it.
  const before = (await fold.boundingBox())!;
  const listEdge = await centerOf(page, "Resize", 1);
  await swipe(page, listEdge, { x: listEdge.x + 60, y: listEdge.y });
  await expect
    .poll(async () => (await fold.boundingBox())!.x)
    .toBeCloseTo(before.x + 60, -1);

  // So does the panel's top edge, including just above its line.
  const top = (await centerOf(page, "Resize", 0)).box.y;
  await swipe(page, { x: 60, y: top + 4 }, { x: 60, y: top + 4 - 120 });
  await expect
    .poll(async () => (await centerOf(page, "Resize", 0)).box.y)
    .toBeCloseTo(top - 120, -1);
});
