import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "playwright/test";
import {
  E2E_PASSWORD,
  signInUser,
  signupUser,
  signOutUser,
  openAccountSettings,
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
async function googleSignIn(page: Page, email: string, subject: string) {
  const popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  const provider = await popup;
  await approve(provider, email, subject);
  await expect.poll(() => provider.isClosed()).toBe(true);
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
  await signOutUser(page);
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
  await signOutUser(page);
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
  await signOutUser(page);
  await googleSignIn(page, googleEmail, subject);
  await expect(page).toHaveURL(/\/spaces\/?$/);
  expect(await page.evaluate(() => localStorage.getItem("user_id"))).toBe(
    userId,
  );
});

for (const javaScriptEnabled of [true, false]) {
  test(`desktop return works with JavaScript ${javaScriptEnabled ? "enabled" : "disabled"}`, async ({
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
    const externalContext = await playwrightBrowser.newContext({
      javaScriptEnabled,
    });
    const browser = await externalContext.newPage();
    await browser.goto(url);
    await expect(
      browser.getByRole("heading", { name: "Confirm in Will Be Done" }),
    ).toBeVisible();
    await browser
      .getByLabel("Confirmation code")
      .fill(
        (await page.getByTestId("google-confirmation-code").textContent())!,
      );
    await browser.getByRole("button", { name: "Continue to Google" }).click();
    const subject = randomUUID();
    const callback = browser.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/auth/google/callback",
    );
    await approve(browser, `desktop-${subject}@gmail.com`, subject);
    expect((await callback).status()).toBe(200);
    await expect(
      browser.getByRole("link", { name: "Return to Will Be Done" }),
    ).toHaveAttribute("href", "will-be-done://auth/google");
    await expect(
      browser.getByRole("link", { name: "Return to Will Be Done" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/spaces\/?$/);
    await externalContext.close();
  });
}

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
