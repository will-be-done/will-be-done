import { expect, test } from "playwright/test";
import {
  createProject,
  createProjectTask,
  createSpace,
  createTodayTask,
  nextScroll,
  openSpace,
  projectSidebarLink,
  scrollViewport,
  signupUser,
  uniqueE2EName,
} from "./helpers";

test.use({ viewport: { width: 1280, height: 520 } });

test("shows a list's scrollbar only on hover and scrolls by dragging the thumb", async ({
  page,
}) => {
  await signupUser(page);
  const spaceName = uniqueE2EName("Scrollbar Space");
  const projectTitle = uniqueE2EName("Scrollbar Project");
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);
  await createProject(page, projectTitle);
  await projectSidebarLink(page, projectTitle).click();
  for (let i = 0; i < 10; i++) {
    await createProjectTask(page, uniqueE2EName(`Scrollbar task ${i}`));
  }

  const column = page
    .locator('[data-focus-column][data-column-model-type="projectSection"]')
    .first();
  const list = scrollViewport(column);
  const scrollbar = column.locator(
    '[data-slot="scroll-area-scrollbar"][data-orientation="vertical"]',
  );
  const thumb = scrollbar.locator('[data-slot="scroll-area-thumb"]');
  await expect(scrollbar).toHaveAttribute("data-overflow");

  // The project page scrolls too; hovering it must not reveal the list's bar.
  await page.getByRole("heading", { name: projectTitle }).hover();
  await expect(scrollbar).toHaveCSS("opacity", "0");

  await list.hover();
  await expect(scrollbar).toHaveCSS("opacity", "1");

  const box = await thumb.boundingBox();
  if (!box) throw new Error("Scrollbar thumb has no bounding box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const scrolled = await nextScroll(list);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 40, {
    steps: 4,
  });
  await page.mouse.up();
  expect((await scrolled()).top).toBeGreaterThan(0);
});

test("passes the wheel from a scrollbar to the list it belongs to", async ({
  page,
}) => {
  await signupUser(page);
  const spaceName = uniqueE2EName("Wheel Space");
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);
  const title = uniqueE2EName("Wheel task");
  await createTodayTask(page, title);
  for (let i = 0; i < 9; i++) {
    await createTodayTask(page, uniqueE2EName(`Wheel task ${i}`));
  }
  await page.getByRole("link", { name: "timeline", exact: true }).click();

  const column = page
    .locator('[data-focus-column][data-column-model-type="dailyList"]')
    .filter({ hasText: title });
  const list = scrollViewport(column);
  // The timeline's days scroll sideways without end.
  const board = page.locator("#timeline-days");
  const scrollbar = column.locator(
    '[data-slot="scroll-area-scrollbar"][data-orientation="vertical"]',
  );
  await expect(scrollbar).toHaveAttribute("data-overflow");

  await list.hover();
  const box = await scrollbar.boundingBox();
  if (!box) throw new Error("Scrollbar has no bounding box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  const listScrolled = await nextScroll(list);
  await page.mouse.wheel(0, 200);
  expect((await listScrolled()).top).toBeGreaterThan(0);

  // Sideways wheel has nothing to do in the list, so the board takes it.
  const boardScrolled = await nextScroll(board);
  await page.mouse.wheel(200, 0);
  expect((await boardScrolled()).left).toBeGreaterThan(0);
});

test("scrolls a board of columns only sideways", async ({ page }) => {
  await signupUser(page);
  const spaceName = uniqueE2EName("Board Space");
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);
  await page.getByRole("link", { name: "timeline", exact: true }).click();

  // In the short projects panel the section's vertical title spills below
  // the board; only the section's own list may scroll vertically.
  const section = page
    .locator('[data-focus-column][data-column-model-type="projectSection"]')
    .first();
  const board = page
    .locator('[data-slot="scroll-area-viewport"]')
    .filter({ has: section })
    .last();
  expect(await board.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
    true,
  );
  await expect(
    board.locator(
      'xpath=../*[@data-slot="scroll-area-scrollbar"][@data-orientation="vertical"]',
    ),
  ).not.toHaveAttribute("data-overflow");
});
