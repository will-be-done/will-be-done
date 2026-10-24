import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test, type Page } from "playwright/test";
import {
  E2E_PASSWORD,
  signInUser,
  signupUser,
  signOutUser,
  openAccountSettings,
  createSpace,
  openSpace,
  openSpaceSettings,
} from "./helpers";

test.skip(
  process.env.WBD_E2E_GOOGLE_ENABLED !== "true",
  "Run with WBD_E2E_GOOGLE_ENABLED=true to use the local Google provider",
);
async function approve(popup: Page, email: string, subject: string) {
  await popup.getByLabel("Google email").fill(email);
  await popup.getByLabel("Google account ID").fill(subject);
  await popup.getByRole("button", { name: "Approve Google sign-in" }).click();
}
async function openGoogleSettings(
  page: Page,
  settings: "account page" | "space settings",
) {
  if (settings === "space settings") {
    const spaceName = `Google settings ${randomUUID()}`;
    await createSpace(page, spaceName);
    await openSpace(page, spaceName);
    const dialog = await openSpaceSettings(page);
    await dialog.getByRole("button", { name: "Account", exact: true }).click();
  } else {
    await page.goto("/account");
  }
}
async function requestGooglePassword(
  page: Page,
  action: "Connect Google" | "Disconnect Google",
  password: string,
) {
  const input = page.getByLabel("Password is required to proceed");
  await expect(input).toHaveCount(0);
  await page.getByRole("button", { name: action, exact: true }).click();
  await expect(input).toBeVisible();
  await expect(input).toBeFocused();
  await expect(input).toBeEmpty();
  await input.fill(password);
}
async function googleSignIn(page: Page, email: string, subject: string) {
  const popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  const provider = await popup;
  await approve(provider, email, subject);
  await expect.poll(() => provider.isClosed()).toBe(true);
}

for (const settings of ["account page", "space settings"] as const) {
  test(`Google signup, password setup, disconnect, explicit relinking, and returning login in ${settings}`, async ({
    page,
    request,
  }) => {
    const subject = randomUUID();
    const email = `google-${subject}@gmail.com`;
    await page.goto("/signup");
    await googleSignIn(page, email, subject);
    await expect(page).toHaveURL(/\/spaces\/?$/);
    const userId = await page.evaluate(() => localStorage.getItem("user_id"));
    await openAccountSettings(page);
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
    await openGoogleSettings(page, settings);
    await requestGooglePassword(page, "Disconnect Google", E2E_PASSWORD);
    await expect(page.getByText(`Connected as ${email}`)).toBeVisible();
    await page.getByRole("button", { name: "Disconnect Google" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Google is disconnected",
    );
    await requestGooglePassword(page, "Connect Google", E2E_PASSWORD);
    const popup = page.waitForEvent("popup");
    await page
      .getByRole("button", { name: "Connect Google", exact: true })
      .click();
    await approve(await popup, email, subject);
    await expect(
      page.getByRole("button", { name: "Confirm connection" }),
    ).toBeVisible();
    await page
      .getByLabel("Password is required to proceed")
      .fill("wrong-password");
    await page.getByRole("button", { name: "Confirm connection" }).click();
    await expect(page.getByRole("alert")).toContainText("Incorrect password");
    await page.getByLabel("Password is required to proceed").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Confirm connection" }).click();
    await expect(page.getByRole("status")).toContainText("Google is connected");
    await expect(
      page.getByLabel("Password is required to proceed"),
    ).toHaveCount(0);
    if (settings === "space settings") {
      await page.getByRole("button", { name: "Close settings" }).click();
      await page.goto("/spaces");
    } else {
      await page.getByRole("link", { name: "Back to spaces" }).click();
    }
    await signOutUser(page);
    await googleSignIn(page, email, subject);
    await expect(page).toHaveURL(/\/spaces\/?$/);
    expect(await page.evaluate(() => localStorage.getItem("user_id"))).toBe(
      userId,
    );
  });
}

for (const settings of ["account page", "space settings"] as const) {
  test(`same-email collision instructs linking; different-email linking keeps the original account in ${settings}`, async ({
    page,
  }) => {
    const subject = randomUUID();
    const user = await signupUser(page, {
      email: `existing-${subject}@example.com`,
    });
    const userId = await page.evaluate(() => localStorage.getItem("user_id"));
    await signOutUser(page);
    await googleSignIn(page, user.email.toUpperCase(), subject);
    await expect(page.getByRole("alert")).toContainText(
      "Sign in with your existing method",
    );
    expect(
      await page.evaluate(() => localStorage.getItem("auth_token")),
    ).toBeNull();
    await signInUser(page, user);
    await openGoogleSettings(page, settings);
    const googleEmail = `different-${subject}@gmail.com`;
    await requestGooglePassword(page, "Connect Google", E2E_PASSWORD);
    const popup = page.waitForEvent("popup");
    await page
      .getByRole("button", { name: "Connect Google", exact: true })
      .click();
    await approve(await popup, googleEmail, subject);
    await expect(
      page.getByRole("button", { name: "Confirm connection" }),
    ).toBeVisible();
    await page
      .getByLabel("Password is required to proceed")
      .fill(user.password);
    await page.getByRole("button", { name: "Confirm connection" }).click();
    await expect(page.getByText(`Connected as ${googleEmail}`)).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Account settings" })
        .getByText(user.email, { exact: true }),
    ).toBeVisible();
    if (settings === "space settings") {
      await page.getByRole("button", { name: "Close settings" }).click();
      await page.goto("/spaces");
    } else {
      await page.getByRole("link", { name: "Back to spaces" }).click();
    }
    await signOutUser(page);
    await googleSignIn(page, googleEmail, subject);
    await expect(page).toHaveURL(/\/spaces\/?$/);
    expect(await page.evaluate(() => localStorage.getItem("user_id"))).toBe(
      userId,
    );
  });
}

test("desktop sign-in opens Google directly and finishes through the loopback listener", async ({
  page,
  browser: playwrightBrowser,
}) => {
  let returned!: (url: URL) => void;
  const loopback = new Promise<URL>((resolve) => (returned = resolve));
  const listener = createServer((request, response) => {
    returned(new URL(request.url!, "http://127.0.0.1"));
    response.end("Return to Will Be Done");
  });
  await new Promise<void>((resolve) =>
    listener.listen(0, "127.0.0.1", resolve),
  );
  const { port } = listener.address() as AddressInfo;
  await page.addInitScript((port) => {
    Object.assign(window, {
      desktopApi: {
        getServerUrl: async () => window.location.origin,
        runGoogleAuth: (url: string) =>
          new Promise((resolve) => {
            Object.assign(window, {
              googleLaunch: `${url}&port=${port}`,
              finishGoogle: resolve,
            });
          }),
      },
    });
  }, port);
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
  const target = await loopback;
  expect(target.pathname).toBe("/google-auth");
  const code = target.searchParams.get("code");
  expect(code).toMatch(/^[\w-]{43}$/);
  await page.evaluate(
    (code) =>
      (
        window as unknown as { finishGoogle: (code: string) => void }
      ).finishGoogle(code),
    code!,
  );
  await expect(page).toHaveURL(/\/spaces\/?$/);
  await externalContext.close();
  listener.close();
});

test("a return link remains when closing the popup and notifying the app are blocked", async ({
  page,
  context,
}) => {
  await context.addInitScript(() => {
    if (window.location.pathname !== "/api/auth/google/callback") return;
    window.close = () => {};
    Object.defineProperty(window, "BroadcastChannel", { value: undefined });
  });
  await page.goto("/login");
  const opened = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  const popup = await opened;
  const subject = randomUUID();
  await approve(popup, `fallback-${subject}@gmail.com`, subject);
  const link = popup.getByRole("link", { name: "Return to Will Be Done" });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", new URL(page.url()).origin);
  await expect(page).toHaveURL(/\/spaces\/?$/);
  await link.click();
  await expect(popup).toHaveURL(/\/spaces\/?$/);
});

test("the callback closes the browser tab before a delayed app poll finishes", async ({
  page,
}) => {
  let release!: () => void;
  const polling = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/trpc/google.poll?*", async (route) => {
    await polling;
    await route.continue();
  });
  try {
    await page.goto("/login");
    const subject = randomUUID();
    await googleSignIn(page, `instant-${subject}@gmail.com`, subject);
    await expect(page).toHaveURL(/\/login$/);
  } finally {
    release();
  }
  await expect(page).toHaveURL(/\/spaces\/?$/);
});

for (const intent of ["signin", "link"] as const) {
  for (const outcome of ["denied", "failed"] as const) {
    test(`${intent} ${outcome} closes the browser tab and shows the error in the app`, async ({
      page,
    }) => {
      if (intent === "link") {
        await signupUser(page);
        await page.goto("/account");
      } else {
        await page.goto("/login");
      }
      if (outcome === "failed") {
        await page
          .context()
          .route("**/api/__test/google/consent?*", (route) => {
            const state = new URL(route.request().url()).searchParams.get(
              "state",
            )!;
            return route.fulfill({
              status: 302,
              headers: {
                location: `/api/auth/google/callback?${new URLSearchParams({ state, code: "invalid" })}`,
              },
            });
          });
      }
      if (intent === "link") {
        await requestGooglePassword(page, "Connect Google", E2E_PASSWORD);
      }
      const opened = page.waitForEvent("popup");
      await page
        .getByRole("button", {
          name: intent === "link" ? "Connect Google" : "Continue with Google",
          exact: true,
        })
        .click();
      const popup = await opened;
      if (outcome === "denied") {
        await popup
          .getByRole("button", { name: "Deny Google sign-in" })
          .click();
      } else {
        const subject = randomUUID();
        await approve(popup, `failed-${subject}@gmail.com`, subject);
      }
      await expect.poll(() => popup.isClosed()).toBe(true);
      await expect(page.getByRole("alert")).toContainText(
        outcome === "denied" ? "cancelled" : "failed",
      );
      await expect(page).toHaveURL(
        intent === "link" ? /\/account$/ : /\/login$/,
      );
      await expect(
        page.getByRole("button", {
          name: intent === "link" ? "Connect Google" : "Continue with Google",
          exact: true,
        }),
      ).toBeEnabled();
    });
  }
}

test("polling tolerates two failures and resets the failure count after a successful poll", async ({
  page,
}) => {
  let polls = 0;
  await page.route("**/api/trpc/google.poll?*", async (route) => {
    polls++;
    if ([1, 2, 4, 5].includes(polls)) return route.abort("failed");
    if (polls === 3)
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          { result: { data: { status: "pending", email: null, error: null } } },
        ]),
      });
    return route.continue();
  });
  await page.goto("/login");
  const subject = randomUUID();
  await googleSignIn(page, `retry-${subject}@gmail.com`, subject);
  await expect(page).toHaveURL(/\/spaces\/?$/, { timeout: 20_000 });
  expect(polls).toBeGreaterThanOrEqual(6);
});

test("three consecutive polling failures end the flow", async ({ page }) => {
  let polls = 0;
  await page.route("**/api/trpc/google.poll?*", (route) => {
    polls++;
    return route.abort("failed");
  });
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 10_000 });
  expect(polls).toBe(3);
  expect(
    await page.evaluate(() => localStorage.getItem("auth_token")),
  ).toBeNull();
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeEnabled();
});

test("account email controls re-enable after their cooldown, including a skipped verification send", async ({
  page,
}) => {
  await page.goto("/signup");
  const subject = randomUUID();
  await googleSignIn(page, `unverified-${subject}@example.com`, subject);
  await expect(page).toHaveURL(/\/spaces\/?$/);
  await page.goto("/account");
  await page.clock.install();
  const verify = page.getByRole("button", { name: "Send email confirmation" });
  const reset = page.getByRole("button", {
    name: "Email me a password setup link",
  });
  await verify.click();
  await expect(page.getByRole("status")).toContainText("recently requested");
  await reset.click();
  await expect(verify).toBeDisabled();
  await expect(reset).toBeDisabled();
  await page.clock.fastForward(61_000);
  await expect(verify).toBeEnabled();
  await expect(reset).toBeEnabled();
  await verify.click();
  await expect(verify).toBeDisabled();
  await reset.click();
  await expect(reset).toBeDisabled();
});
