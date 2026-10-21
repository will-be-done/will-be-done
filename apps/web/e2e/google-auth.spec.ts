import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "playwright/test";
import { E2E_PASSWORD, signInUser, signupUser } from "./helpers";

test.skip(
  process.env.WBD_E2E_GOOGLE_ENABLED !== "true",
  "Run with WBD_E2E_GOOGLE_ENABLED=true to use the local Google provider",
);
async function approve(popup: Page, email: string, subject: string) {
  await popup.getByLabel("Google email").fill(email);
  await popup.getByLabel("Google account ID").fill(subject);
  await popup.getByRole("button", { name: "Approve Google sign-in" }).click();
}
async function googleSignIn(page: Page, email: string, subject: string) {
  const popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await approve(await popup, email, subject);
}

test("Google signup, password setup, disconnect, explicit relinking, and returning login", async ({
  page,
  request,
}) => {
  const subject = randomUUID();
  const email = `google-${subject}@gmail.com`;
  await page.goto("/signup");
  await googleSignIn(page, email, subject);
  await expect(page).toHaveURL(/\/spaces\/?$/);
  const userId = await page.evaluate(() => localStorage.getItem("user_id"));
  await page.getByRole("link", { name: "Account settings" }).click();
  await expect(page.getByText(`Connected as ${email}`)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Disconnect Google" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Email me a password setup link" })
    .click();
  await expect(page.getByRole("status")).toContainText("Check your inbox");
  const mails = await request.get(
    `http://127.0.0.1:${process.env.PLAYWRIGHT_API_PORT ?? "3200"}/__test/emails`,
    { params: { to: email } },
  );
  const mail = (
    (await mails.json()) as { subject: string; text: string }[]
  ).find((item) => item.subject === "Reset your password")!;
  await page.goto(mail.text.match(/http:\/\/[^\s]+#token=[^\s]+/)![0]);
  await page.getByLabel("New password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByLabel("Confirm new password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Your password has been changed",
  );
  await signInUser(page, { email, password: E2E_PASSWORD });
  await page.goto("/account");
  await page.getByLabel("Current password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Disconnect Google" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Google is disconnected",
  );
  const popup = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Connect Google", exact: true })
    .click();
  await approve(await popup, email, subject);
  await expect(
    page.getByRole("button", { name: "Confirm connection" }),
  ).toBeVisible();
  await page.getByLabel("Current password").fill("wrong-password");
  await page.getByRole("button", { name: "Confirm connection" }).click();
  await expect(page.getByRole("alert")).toContainText("Incorrect password");
  await page.getByLabel("Current password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Confirm connection" }).click();
  await expect(page.getByRole("status")).toContainText("Google is connected");
  await page.getByRole("link", { name: "Back to spaces" }).click();
  await page.getByRole("button", { name: "Sign Out" }).click();
  await googleSignIn(page, email, subject);
  await expect(page).toHaveURL(/\/spaces\/?$/);
  expect(await page.evaluate(() => localStorage.getItem("user_id"))).toBe(
    userId,
  );
});

test("same-email collision instructs linking; different-email linking keeps the original account", async ({
  page,
}) => {
  const subject = randomUUID();
  const user = await signupUser(page, {
    email: `existing-${subject}@example.com`,
  });
  const userId = await page.evaluate(() => localStorage.getItem("user_id"));
  await page.getByRole("button", { name: "Sign Out" }).click();
  await googleSignIn(page, user.email.toUpperCase(), subject);
  await expect(page.getByRole("alert")).toContainText(
    "Sign in with your existing method",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("auth_token")),
  ).toBeNull();
  await signInUser(page, user);
  await page.goto("/account");
  const googleEmail = `different-${subject}@gmail.com`;
  const popup = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Connect Google", exact: true })
    .click();
  await approve(await popup, googleEmail, subject);
  await expect(
    page.getByRole("button", { name: "Confirm connection" }),
  ).toBeVisible();
  await page.getByLabel("Current password").fill(user.password);
  await page.getByRole("button", { name: "Confirm connection" }).click();
  await expect(page.getByText(`Connected as ${googleEmail}`)).toBeVisible();
  await expect(page.getByText(user.email, { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Back to spaces" }).click();
  await page.getByRole("button", { name: "Sign Out" }).click();
  await googleSignIn(page, googleEmail, subject);
  await expect(page).toHaveURL(/\/spaces\/?$/);
  expect(await page.evaluate(() => localStorage.getItem("user_id"))).toBe(
    userId,
  );
});

test("desktop bridge opens the system-browser flow and the app receives its result", async ({
  page,
  browser: playwrightBrowser,
}) => {
  await page.addInitScript(() => {
    Object.assign(window, {
      desktopApi: {
        getServerUrl: async () => window.location.origin,
        openGoogleAuth: async (url: string) => {
          Object.assign(window, { googleLaunch: url });
        },
      },
    });
  });
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await page.waitForFunction(() =>
    Boolean((window as unknown as { googleLaunch?: string }).googleLaunch),
  );
  const url = await page.evaluate(
    () => (window as unknown as { googleLaunch: string }).googleLaunch,
  );
  expect(new URL(url).pathname).toBe("/api/auth/google/launch");
  const externalContext = await playwrightBrowser.newContext();
  const browser = await externalContext.newPage();
  await browser.goto(url);
  const subject = randomUUID();
  await approve(browser, `desktop-${subject}@gmail.com`, subject);
  await expect(
    browser.getByText(
      "Google confirmed your identity. Return to the app to finish.",
    ),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/spaces\/?$/);
  await externalContext.close();
});
