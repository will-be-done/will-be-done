import {
  expect,
  test,
  type JSHandle,
  type Locator,
  type Page,
} from "playwright/test";
import {
  createProject,
  createProjectTask,
  createSpace,
  createTodayTask,
  dailyTaskItem,
  openSpace,
  openTaskActions,
  projectSidebarLink,
  projectTaskItem,
  signupUser,
  stashTaskItem,
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

test("does not move a task to Inbox when released outside the link", async ({
  page,
}) => {
  const spaceName = uniqueE2EName("Inbox Leave Space");
  const projectTitle = uniqueE2EName("Inbox Leave Project");
  const taskTitle = uniqueE2EName("Task to keep in project");
  const inbox = page.getByRole("link", { name: /^Inbox(?:\s+\d+)?$/ });
  const outside = page.getByRole("link", { name: /today/i });

  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);
  await createProject(page, projectTitle);
  await projectSidebarLink(page, projectTitle).click();
  const source = await createProjectTask(page, taskTitle);
  const dataTransfer = await startDrag(page, source);

  await dragOver(inbox, dataTransfer);
  await expect(inbox).toHaveClass(/ring-2 ring-accent/);
  await dragOver(outside, dataTransfer);
  await expect(inbox).not.toHaveClass(/ring-2 ring-accent/);
  await outside.dispatchEvent("drop", { dataTransfer });
  await dataTransfer.dispose();

  await expect(source).toBeVisible();
  await inbox.click();
  await expect(projectTaskItem(page, taskTitle)).toHaveCount(0);
  await projectSidebarLink(page, projectTitle).click();
  await page.reload();
  await expect(projectTaskItem(page, taskTitle)).toBeVisible();
});

for (const sourceView of ["project", "Today", "stash"] as const) {
  test(`moves a task from ${sourceView} to the sidebar Inbox and persists it`, async ({
    page,
  }) => {
    const spaceName = uniqueE2EName("Inbox Drop Space");
    const projectTitle = uniqueE2EName("Inbox Drop Project");
    const taskTitle = uniqueE2EName("Task to move to Inbox");
    const inbox = page.getByRole("link", { name: /^Inbox(?:\s+\d+)?$/ });

    await signupUser(page);
    await createSpace(page, spaceName);
    await openSpace(page, spaceName);
    await createProject(page, projectTitle);
    await projectSidebarLink(page, projectTitle).click();
    let source = await createProjectTask(page, taskTitle);

    if (sourceView === "Today") {
      await openTaskActions(page, taskTitle);
      await page.getByRole("menuitem", { name: /schedule today/i }).click();
      await page.getByRole("link", { name: /today/i }).click();
      source = dailyTaskItem(page, taskTitle);
    } else if (sourceView === "stash") {
      await openTaskActions(page, taskTitle);
      await page.getByRole("menuitem", { name: /stash task/i }).click();
      await page.getByTestId("stash-toggle").click();
      source = stashTaskItem(page, taskTitle);
    }

    const sourceUrl = page.url();
    const dataTransfer = await startDrag(page, source);
    await dragOver(inbox, dataTransfer);
    await expect(inbox).toHaveClass(/ring-2 ring-accent/);
    await inbox.dispatchEvent("drop", { dataTransfer });
    await dataTransfer.dispose();

    await expect(inbox).not.toHaveClass(/ring-2 ring-accent/);
    await expect(page).toHaveURL(sourceUrl);
    if (sourceView === "Today") {
      await expect(source).toBeVisible();
    } else {
      await expect(source).toHaveCount(0);
    }
    if (sourceView === "stash") {
      await expect(page.getByTestId("stash-count")).toHaveCount(0);
    }

    await inbox.click();
    await expect(projectTaskItem(page, taskTitle)).toBeVisible();
    await page.reload();
    await expect(projectTaskItem(page, taskTitle)).toBeVisible();

    await projectSidebarLink(page, projectTitle).click();
    await expect(projectTaskItem(page, taskTitle)).toHaveCount(0);
    if (sourceView === "Today") {
      await page.getByRole("link", { name: /today/i }).click();
      await expect(dailyTaskItem(page, taskTitle)).toBeVisible();
    }
  });
}

test("captures the whole focused task border and preserves the cursor position", async ({
  page,
}, testInfo) => {
  await signupUser(page);
  const spaceName = uniqueE2EName("Drag Preview Space");
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);
  const source = await createTodayTask(page, "Task with a full drag border");
  await source.focus();
  await expect(source).toBeFocused();
  await expect(source).toHaveClass(/ring-2 ring-accent/);
  const box = await source.boundingBox();
  if (!box) throw new Error("Drag source has no bounding box");

  // Inspect the exact element passed to the browser before the temporary
  // preview is removed. Keep a copy for the visual check.
  await page.evaluate(() => {
    const original = DataTransfer.prototype.setDragImage;
    DataTransfer.prototype.setDragImage = function (image, x, y) {
      DataTransfer.prototype.setDragImage = original;
      const copy = image.cloneNode(true) as HTMLElement;
      copy.dataset.testid = "captured-drag-preview";
      copy.dataset.offsetX = String(x);
      copy.dataset.offsetY = String(y);
      copy.style.left = "20px";
      copy.style.top = "20px";
      document.body.append(copy);
      original.call(this, image, x, y);
    };
  });
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent("dragstart", {
    dataTransfer,
    clientX: box.x + box.width / 2,
    clientY: box.y + 20,
  });

  const capture = page.getByTestId("captured-drag-preview");
  await expect(capture).toBeVisible();
  const geometry = await capture.evaluate((container) => {
    const card = container.firstElementChild as HTMLElement;
    const outer = container.getBoundingClientRect();
    const inner = card.getBoundingClientRect();
    return {
      margins: [
        inner.left - outer.left,
        inner.top - outer.top,
        outer.right - inner.right,
        outer.bottom - inner.bottom,
      ],
      width: inner.width,
      height: inner.height,
      shadow: getComputedStyle(card).boxShadow,
      pointerX:
        Number((container as HTMLElement).dataset.offsetX) -
        (inner.left - outer.left),
      pointerY:
        Number((container as HTMLElement).dataset.offsetY) -
        (inner.top - outer.top),
    };
  });
  expect(geometry.shadow).not.toBe("none");
  for (const margin of geometry.margins)
    expect(margin).toBeGreaterThanOrEqual(2);
  expect(geometry.width).toBeCloseTo(box.width);
  expect(geometry.height).toBeCloseTo(box.height);
  expect(geometry.pointerX).toBeCloseTo(box.width / 2);
  expect(geometry.pointerY).toBeCloseTo(20);
  await capture.screenshot({ path: testInfo.outputPath("drag-preview.png") });
  await capture.evaluate((container) => container.remove());
  await source.dispatchEvent("dragend", { dataTransfer });
  await dataTransfer.dispose();
});

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

  await dragOver(column, dataTransfer);
  await expect(column).not.toHaveAttribute("data-drop-active", "true");

  await dragOver(done, dataTransfer);
  await expect(
    target.locator("..").locator("[data-drop-indicator]"),
  ).toHaveCount(0);
  await expect(done.locator("..").locator("[data-drop-indicator]")).toHaveCount(
    0,
  );
  await expect(column).not.toHaveAttribute("data-drop-active", "true");

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

test("rejects the task's existing project section while allowing row reordering", async ({
  page,
}) => {
  await signupUser(page);
  const spaceName = uniqueE2EName("Section DnD Space");
  const projectTitle = uniqueE2EName("DnD Project");
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);
  await createProject(page, projectTitle);
  await projectSidebarLink(page, projectTitle).click();
  const sourceTitle = uniqueE2EName("Section source");
  const targetTitle = uniqueE2EName("Section target");
  const source = await createProjectTask(page, sourceTitle);
  const target = await createProjectTask(page, targetTitle);
  const column = page
    .locator('[data-focus-column][data-column-model-type="projectSection"]')
    .first();
  const rows = column.locator('[data-focusable-key^="task^^"]');
  await expect(rows.nth(0)).toContainText(targetTitle);
  await expect(rows.nth(1)).toContainText(sourceTitle);
  const dataTransfer = await startDrag(page, source);
  await dragOver(column, dataTransfer);
  await expect(column).not.toHaveAttribute("data-drop-active", "true");
  await dragOver(target, dataTransfer);
  await expect(
    target.locator("..").locator('[data-drop-indicator="top"]'),
  ).toBeVisible();
  await expect(column).not.toHaveAttribute("data-drop-active", "true");
  await target.dispatchEvent("drop", { dataTransfer });
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
