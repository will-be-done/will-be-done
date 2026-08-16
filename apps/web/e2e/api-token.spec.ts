import { createHash, randomUUID } from "node:crypto";
import { formatHlc } from "@will-be-done/slices/common";
import { expect, test, type Page } from "playwright/test";

import {
  createSpace,
  createTodayTask,
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

type Task = {
  id: string;
  title: string;
};

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

async function deleteIndexedDbDatabase(page: Page, name: string) {
  await page.goto("/api/health");
  await page.evaluate(async (databaseName) => {
    const databases = await indexedDB.databases();
    if (!databases.some((database) => database.name === databaseName)) {
      throw new Error(`IndexedDB database not found: ${databaseName}`);
    }

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(databaseName);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(new Error(`IndexedDB database is blocked: ${databaseName}`));
    });
  }, name);
}

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

test("downloads the client's own accepted changes after local database loss", async ({
  page,
}) => {
  test.setTimeout(60_000);

  const spaceName = uniqueE2EName("E2E client recovery space");
  const taskTitle = uniqueE2EName("E2E client recovery task");

  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);

  const appUrl = page.url();
  const spaceId = new URL(appUrl).pathname.split("/")[2];
  const sessionToken = await page.evaluate(() =>
    localStorage.getItem("auth_token"),
  );
  expect(sessionToken).toBeTruthy();
  const authorization = { Authorization: `Bearer ${sessionToken}` };

  await expect
    .poll(
      async () =>
        (
          await page.request.get(`/api/v1/spaces/${spaceId}/projects`, {
            headers: authorization,
          })
        ).status(),
      { timeout: 15_000 },
    )
    .toBe(200);

  await createTodayTask(page, taskTitle);

  let serverTask: Task | undefined;
  await expect
    .poll(
      async () => {
        const response = await page.request.get(
          `/api/v1/spaces/${spaceId}/tasks?limit=200`,
          { headers: authorization },
        );
        if (response.status() !== 200) return false;
        const body = (await response.json()) as { tasks: Task[] };
        serverTask = body.tasks.find((task) => task.title === taskTitle);
        return serverTask !== undefined;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  expect(serverTask).toBeTruthy();

  const databaseName = `space-${spaceId}`;
  const clientId = await page.evaluate(
    (key) => localStorage.getItem(key),
    `clientId-${databaseName}-indexeddb`,
  );
  expect(clientId).toBeTruthy();

  await deleteIndexedDbDatabase(page, databaseName);

  const recoveryCommitPromise = page.waitForResponse(
    (response) => {
      const pathname = new URL(response.url()).pathname;
      return (
        response.request().method() === "POST" &&
        pathname.startsWith(`/api/sync/v4/space/${spaceId}/sessions/`) &&
        pathname.endsWith("/commit")
      );
    },
    { timeout: 20_000 },
  );
  await page.goto(appUrl);

  const recoveryCommit = await recoveryCommitPromise;
  expect(recoveryCommit.status()).toBe(200);
  const recovery = (await recoveryCommit.json()) as {
    download:
      | {
          type: "inline";
          changesets: Array<{
            tableName: string;
            data: Array<{ row?: Record<string, unknown> }>;
          }>;
        }
      | { type: "staged" };
  };
  expect(recovery.download.type).toBe("inline");
  if (recovery.download.type !== "inline") {
    throw new Error("Expected the small recovery download to be inline");
  }
  expect(
    recovery.download.changesets.some(
      (changeset) =>
        changeset.tableName === "tasks" &&
        changeset.data.some(({ row }) => row?.title === taskTitle),
    ),
  ).toBe(true);

  await expect(taskItem(page, taskTitle)).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(
      () =>
        page.evaluate(
          (key) => localStorage.getItem(key),
          `clientId-${databaseName}-indexeddb`,
        ),
      { timeout: 5_000 },
    )
    .toBe(clientId);

  const recoveredTaskResponse = await page.request.get(
    `/api/v1/spaces/${spaceId}/tasks/${serverTask!.id}`,
    { headers: authorization },
  );
  await expect(recoveredTaskResponse).toBeOK();
});

test("resends newer client state after server history loss and retries commit idempotently", async ({
  page,
}) => {
  await signupUser(page);

  const { sessionToken, userId } = await page.evaluate(() => ({
    sessionToken: localStorage.getItem("auth_token"),
    userId: localStorage.getItem("user_id"),
  }));
  expect(sessionToken).toBeTruthy();
  expect(userId).toBeTruthy();

  const spaceId = randomUUID();
  const spaceName = uniqueE2EName("E2E server recovery space");
  const clientId = `e2e-recovery-${randomUUID()}`;
  const clock = formatHlc({
    physical: Date.now(),
    logical: 0,
    actorId: clientId,
  });
  const changeId = `spaces:${spaceId}`;
  const cursor = { clock, changeId };
  const authorization = { Authorization: `Bearer ${sessionToken}` };

  // The client remembers this cursor as accepted, while the restored server
  // has neither the cursor nor the corresponding row.
  const sessionResponse = await page.request.post(
    `/api/sync/v4/user/${userId}/sessions`,
    {
      headers: authorization,
      data: {
        syncVersion: 4,
        dbId: userId,
        dbType: "user",
        clientId,
        expectedAcceptedClientCursor: cursor,
        coveredClientCursor: cursor,
        expectedAcknowledgedServerRevision: 0,
        appliedServerRevision: 0,
      },
    },
  );
  await expect(sessionResponse).toBeOK();
  const session = (await sessionResponse.json()) as {
    uploadId: string;
    uploadFromCursor: { clock: string; changeId: string } | null;
    serverHistoryLost: boolean;
  };
  expect(session.serverHistoryLost).toBe(true);
  expect(session.uploadFromCursor).toBeNull();

  const now = new Date().toISOString();
  const row = {
    id: spaceId,
    type: "space",
    name: spaceName,
    createdAt: now,
    updatedAt: now,
  };
  const change = {
    id: changeId,
    entityId: spaceId,
    tableName: "spaces",
    createdAt: clock,
    updatedAt: clock,
    deletedAt: null,
    clientId,
    changes: Object.fromEntries(Object.keys(row).map((key) => [key, clock])),
  };
  const payload = JSON.stringify([
    { tableName: "spaces", data: [{ change, row }] },
  ]);
  const chunkChecksum = sha256(payload);

  const chunkResponse = await page.request.put(
    `/api/sync/v4/user/${userId}/sessions/${session.uploadId}/chunks/0`,
    {
      headers: authorization,
      data: { checksum: chunkChecksum, payload },
    },
  );
  await expect(chunkResponse).toBeOK();

  const commitUrl = `/api/sync/v4/user/${userId}/sessions/${session.uploadId}/commit`;
  const commitRequest = {
    headers: authorization,
    data: {
      chunkCount: 1,
      changeCount: 1,
      throughCursor: cursor,
      checksum: sha256(chunkChecksum),
    },
  };
  const commitResponse = await page.request.post(commitUrl, commitRequest);
  await expect(commitResponse).toBeOK();
  const committed = await commitResponse.json();
  expect(committed).toMatchObject({
    acceptedClientCursor: cursor,
    download: { type: "inline", changesets: [] },
  });

  // Model a lost commit response by repeating the same request. The stored
  // response must be returned without applying the materialized change twice.
  const retryResponse = await page.request.post(commitUrl, commitRequest);
  await expect(retryResponse).toBeOK();
  expect(await retryResponse.json()).toEqual(committed);

  const spaceResponse = await page.request.get(`/api/v1/spaces/${spaceId}`, {
    headers: authorization,
  });
  await expect(spaceResponse).toBeOK();
  await expect(spaceResponse.json()).resolves.toMatchObject({
    space: { id: spaceId, name: spaceName },
  });

  const spacesResponse = await page.request.get("/api/v1/spaces", {
    headers: authorization,
  });
  await expect(spacesResponse).toBeOK();
  const { spaces } = (await spacesResponse.json()) as {
    spaces: Array<{ id: string }>;
  };
  expect(spaces.filter((space) => space.id === spaceId)).toHaveLength(1);
});

test("does not show the prior user's cached tokens after account switching", async ({
  page,
}) => {
  const firstSpaceName = uniqueE2EName("First user's token space");
  await signupUser(page);
  await createSpace(page, firstSpaceName);
  await openSpace(page, firstSpaceName);

  const firstToken = await page.evaluate(() =>
    localStorage.getItem("auth_token"),
  );
  expect(firstToken).toBeTruthy();
  let settings = await openSpaceSettings(page);
  await settings.getByRole("button", { name: "Tokens" }).click();
  await expect(
    settings.locator("code").filter({ hasText: firstToken!.slice(-8) }),
  ).toBeVisible();
  await settings.getByRole("button", { name: "Close settings" }).click();

  await page.goto("/spaces");
  await page.getByRole("button", { name: "Sign Out" }).click();
  const secondSpaceName = uniqueE2EName("Second user's token space");
  await signupUser(page);
  await createSpace(page, secondSpaceName);
  await openSpace(page, secondSpaceName);
  const secondToken = await page.evaluate(() =>
    localStorage.getItem("auth_token"),
  );
  expect(secondToken).toBeTruthy();

  settings = await openSpaceSettings(page);
  await settings.getByRole("button", { name: "Tokens" }).click();
  await expect(
    settings.locator("code").filter({ hasText: secondToken!.slice(-8) }),
  ).toBeVisible();
  await expect(
    settings.locator("code").filter({ hasText: firstToken!.slice(-8) }),
  ).toHaveCount(0);
});
