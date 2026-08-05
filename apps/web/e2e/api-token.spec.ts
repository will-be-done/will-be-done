import { expect, test } from "playwright/test";

import {
  createSpace,
  openSpace,
  openSpaceSettings,
  signupUser,
  taskItem,
  uniqueE2EName,
} from "./helpers";

type Project = {
  id: string;
  isInbox: boolean;
};

type ProjectSection = {
  id: string;
};

test("syncs API token writes and rejects the token after revocation", async ({
  page,
}) => {
  const spaceName = uniqueE2EName("E2E API Token Space");
  const taskTitle = uniqueE2EName("E2E API token task");

  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);

  const spaceId = new URL(page.url()).pathname.split("/")[2];
  expect(spaceId).toBeTruthy();
  const sessionToken = await page.evaluate(() =>
    localStorage.getItem("auth_token"),
  );
  expect(sessionToken).toBeTruthy();
  await expect
    .poll(
      async () =>
        (
          await page.request.get(`/api/v1/spaces/${spaceId}/projects`, {
            headers: { Authorization: `Bearer ${sessionToken}` },
          })
        ).status(),
      { timeout: 10_000 },
    )
    .toBe(200);

  // Recreate the socket after signup so it connects with the stored token.
  await page.reload();
  await expect(page.getByRole("button", { name: "Add task" })).toBeVisible();

  const settings = await openSpaceSettings(page);
  await settings.getByRole("button", { name: "Tokens" }).click();
  await settings.getByRole("button", { name: "Create token" }).click();

  const revealedToken = settings.locator("code[title]");
  await expect(revealedToken).toHaveCount(1);
  const token = await revealedToken.getAttribute("title");
  expect(token).toBeTruthy();

  const authorization = { Authorization: `Bearer ${token}` };
  const projectsResponse = await page.request.get(
    `/api/v1/spaces/${spaceId}/projects`,
    { headers: authorization },
  );
  await expect(projectsResponse).toBeOK();
  const { projects } = (await projectsResponse.json()) as {
    projects: Project[];
  };
  const inbox = projects.find((project) => project.isInbox);
  expect(inbox).toBeTruthy();

  const sectionsResponse = await page.request.get(
    `/api/v1/spaces/${spaceId}/projects/${inbox!.id}/sections`,
    { headers: authorization },
  );
  await expect(sectionsResponse).toBeOK();
  const { sections } = (await sectionsResponse.json()) as {
    sections: ProjectSection[];
  };
  expect(sections).toHaveLength(1);

  await settings.getByRole("button", { name: "Close settings" }).click();
  await page.getByRole("link", { name: /^Inbox(?:\s+\d+)?$/ }).click();
  await expect(page).toHaveURL(/\/spaces\/[^/]+\/projects\/[^/]+$/);

  const createTaskResponse = await page.request.post(
    `/api/v1/spaces/${spaceId}/sections/${sections[0]!.id}/tasks`,
    {
      headers: authorization,
      data: { title: taskTitle },
    },
  );
  expect(createTaskResponse.status()).toBe(201);
  const { task } = (await createTaskResponse.json()) as {
    task: { id: string };
  };

  await expect(taskItem(page, taskTitle)).toBeVisible();

  const reopenedSettings = await openSpaceSettings(page);
  await reopenedSettings.getByRole("button", { name: "Tokens" }).click();
  const tokenCode = reopenedSettings
    .locator("code")
    .filter({ hasText: token!.slice(-8) });
  const tokenRow = tokenCode.locator("xpath=../../..");

  await expect(tokenCode).toBeVisible();
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("immediately lose access");
    await dialog.accept();
  });
  await tokenRow.getByRole("button", { name: "Delete token" }).click();
  await expect(tokenCode).toHaveCount(0);

  const revokedResponse = await page.request.get(
    `/api/v1/spaces/${spaceId}/tasks/${task.id}`,
    { headers: authorization },
  );
  expect(revokedResponse.status()).toBe(401);
  await expect(revokedResponse.json()).resolves.toMatchObject({
    code: "UNAUTHORIZED",
  });
});
