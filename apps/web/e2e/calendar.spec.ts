import { expect, test, type Locator, type Page } from "playwright/test";
import { addDays, format } from "date-fns";
import {
  createProjectTask,
  createSpace,
  openSpace,
  projectTaskItem,
  signupUser,
  uniqueE2EName,
} from "./helpers";

const hourHeight = 48;

function gridColumn(page: Page, date: string): Locator {
  return page.locator(`[data-calendar-grid][data-calendar-date="${date}"]`);
}

function block(page: Page, title: string): Locator {
  return page.locator("[data-calendar-grid] [data-focusable-key]", {
    hasText: title,
  });
}

async function dragBy(page: Page, from: { x: number; y: number }, dy: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // Several steps so the drag passes the activation distance first.
  for (let step = 1; step <= 5; step++) {
    await page.mouse.move(from.x, from.y + (dy * step) / 5);
  }
  await page.mouse.up();
}

test("plans a timed task on the calendar by dragging and resizing", async ({
  page,
}) => {
  const spaceName = uniqueE2EName("Calendar Space");
  const title = uniqueE2EName("Calendar task");
  const today = format(new Date(), "yyyy-MM-dd");

  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);
  await page.getByRole("link", { name: "calendar", exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/calendar/${today}\\?view=week&projectId=inbox$`),
  );

  // Click the 10:00 slot of today to create a task there.
  const column = gridColumn(page, today);
  await column.evaluate((el) => {
    el.closest(".overflow-y-auto")!.scrollTop = 9 * 48;
  });
  await column.click({ position: { x: 10, y: 10 * hourHeight + 5 } });
  const dialog = page.getByRole("dialog", { name: "New task at 10:00 AM" });
  await dialog.getByRole("textbox").fill(title);
  await dialog.getByRole("button", { name: "Confirm" }).click();
  await expect(dialog).toBeHidden();
  await expect(block(page, title)).toContainText("10:00 AM");

  // Move it two hours later.
  let box = (await block(page, title).boundingBox())!;
  await dragBy(page, { x: box.x + 20, y: box.y + 5 }, 2 * hourHeight);
  await expect(block(page, title)).toContainText("12:00 PM");

  // Stretch the default 30m block to 1h 30m.
  box = (await block(page, title).boundingBox())!;
  await dragBy(page, { x: box.x + 20, y: box.y + box.height - 2 }, hourHeight);
  await expect(block(page, title)).toContainText("1h 30m");

  await page.getByRole("link", { name: "Plan", exact: true }).click();
  const card = page.locator(`[data-calendar-date="${today}"]`, {
    hasText: title,
  });
  await expect(card).toContainText("12:00 PM · 1h 30m");

  await page.reload();
  await expect(card).toContainText("12:00 PM · 1h 30m");

  await page.getByRole("link", { name: "Month", exact: true }).click();
  await expect(
    page.locator(`[data-calendar-date="${today}"]`, { hasText: title }),
  ).toContainText("12:00 PM");
});

test("schedules a task dragged from the projects view onto a time slot", async ({
  page,
}) => {
  const spaceName = uniqueE2EName("Calendar Projects Space");
  const title = uniqueE2EName("Project task");
  const today = format(new Date(), "yyyy-MM-dd");

  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);
  await page.getByRole("link", { name: "calendar", exact: true }).click();

  const source = await createProjectTask(page, title);
  const column = gridColumn(page, today);
  await column.evaluate((el) => {
    el.closest(".overflow-y-auto")!.scrollTop = 13 * 48;
  });
  // The 14:00 line in viewport coordinates.
  const box = (await column.boundingBox())!;
  const point = { clientX: box.x + 20, clientY: box.y + 14 * hourHeight + 2 };

  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent("dragstart", { dataTransfer });
  await column.dispatchEvent("dragenter", { dataTransfer, ...point });
  await column.dispatchEvent("dragover", { dataTransfer, ...point });
  await column.dispatchEvent("drop", { dataTransfer, ...point });
  await dataTransfer.dispose();

  await expect(block(page, title)).toContainText("2:00 PM");
  // Still listed in its project, now scheduled.
  await expect(projectTaskItem(page, title)).toBeVisible();
});

test("retimes a repeating task by dragging its upcoming occurrence", async ({
  page,
}) => {
  const spaceName = uniqueE2EName("Calendar Template Space");
  const title = uniqueE2EName("Water the plants");
  const today = format(new Date(), "yyyy-MM-dd");
  const tomorrow = format(addDays(new Date(), 1), "yyyy-MM-dd");

  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);
  await page.getByRole("link", { name: "calendar", exact: true }).click();

  await page
    .locator(`[data-calendar-untimed][data-calendar-date="${today}"]`)
    .dblclick({ position: { x: 5, y: 5 } });
  const dialog = page.getByRole("dialog", { name: "New task" });
  await dialog.getByRole("textbox").fill(title);
  await dialog.getByRole("button", { name: "Confirm" }).click();
  await expect(dialog).toBeHidden();
  await page
    .locator("[data-calendar-untimed] [data-focusable-key]", { hasText: title })
    .click();
  await page.getByRole("button", { name: /make repeating/i }).click();
  await page.getByRole("button", { name: "Ok" }).click();
  await expect(page.getByRole("button", { name: "Ok" })).toBeHidden();

  await page.getByRole("link", { name: "Day", exact: true }).click();
  await page.getByRole("link", { name: "Next" }).click();
  await expect(page).toHaveURL(new RegExp(`/calendar/${tomorrow}\\?view=day`));
  const ghost = page.locator(
    `[data-calendar-untimed][data-calendar-date="${tomorrow}"] [data-focusable-key^="template"]`,
    { hasText: title },
  );
  const column = gridColumn(page, tomorrow);
  await column.evaluate((el) => {
    el.closest(".overflow-y-auto")!.scrollTop = 8 * 48;
  });

  // Drag the occurrence from the all-day row to 9:00.
  const from = (await ghost.boundingBox())!;
  const grid = (await column.boundingBox())!;
  await page.mouse.move(from.x + 10, from.y + 5);
  await page.mouse.down();
  for (let step = 1; step <= 5; step++) {
    await page.mouse.move(
      from.x + 10,
      from.y + 5 + ((grid.y + 9 * hourHeight + 2 - from.y - 5) * step) / 5,
    );
  }
  await page.mouse.up();
  await expect(block(page, title)).toContainText("9:00 AM");

  // Stretch the default 30m block to 1h 30m.
  const box = (await block(page, title).boundingBox())!;
  await dragBy(page, { x: box.x + 20, y: box.y + box.height - 2 }, hourHeight);
  await expect(block(page, title)).toContainText("1h 30m");

  // Every upcoming occurrence follows the template (Plan starts tomorrow).
  await page.getByRole("link", { name: "Plan", exact: true }).click();
  await expect(
    page
      .locator('[data-calendar-date] [data-focusable-key^="template"]', {
        hasText: title,
      })
      .filter({ hasText: "9:00 AM · 1h 30m" }),
  ).toHaveCount(14);

  await page.getByRole("link", { name: "Month", exact: true }).click();
  await expect(
    page.locator(
      `[data-calendar-date="${tomorrow}"] [data-focusable-key^="template"]`,
      { hasText: title },
    ),
  ).toContainText("9:00 AM");
});
