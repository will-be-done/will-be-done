import { expect, test } from "playwright/test";
import {
  createProject,
  createProjectTask,
  createSpace,
  openSpace,
  projectSidebarLink,
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

  const list = page
    .locator('[data-focus-column][data-column-model-type="projectSection"]')
    .first()
    .locator(".overflow-auto");
  const scrollbar = list.locator("xpath=following-sibling::div[1]");
  const thumb = scrollbar.locator("div");
  await expect(scrollbar).toHaveAttribute("data-overflow");

  // The project page scrolls too; hovering it must not reveal the list's bar.
  await page.getByRole("heading", { name: projectTitle }).hover();
  await expect(scrollbar).toHaveCSS("opacity", "0");

  await list.hover();
  await expect(scrollbar).toHaveCSS("opacity", "1");

  const box = await thumb.boundingBox();
  if (!box) throw new Error("Scrollbar thumb has no bounding box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 40, {
    steps: 4,
  });
  await page.mouse.up();
  await expect
    .poll(() => list.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
});
