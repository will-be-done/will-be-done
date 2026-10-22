import { expect, test, type APIRequestContext } from "playwright/test";
import { signupUser, signInUser, signOutUser } from "./helpers";

test.skip(
  process.env.WBD_E2E_EMAIL_ENABLED !== "true",
  "Run with WBD_E2E_EMAIL_ENABLED=true to use the local mail sink",
);
const api = `http://127.0.0.1:${process.env.PLAYWRIGHT_API_PORT ?? "3200"}`;
type Mail = { subject: string; text: string };
async function readMail(
  request: APIRequestContext,
  email: string,
): Promise<Mail[]> {
  const response = await request.get(`${api}/__test/emails`, {
    params: { to: email },
  });
  expect(response.ok()).toBe(true);
  return response.json();
}
async function waitForMail(
  request: APIRequestContext,
  email: string,
  subject: string,
): Promise<Mail> {
  let mail: Mail | undefined;
  await expect
    .poll(async () => {
      mail = (await readMail(request, email)).find(
        (message) => message.subject === subject,
      );
      return mail !== undefined;
    })
    .toBe(true);
  if (!mail) throw new Error(`Expected email with subject: ${subject}`);
  return mail;
}
function link(mail: Mail): string {
  return mail.text.match(/http:\/\/[^\s]+#token=[^\s]+/)![0];
}

test("unconfirmed accounts can change email with their password", async ({
  page,
  request,
}) => {
  const user = await signupUser(page);
  const newEmail = `changed-${user.email}`;
  await page.goto("/account");
  await page.getByRole("button", { name: "Change email", exact: true }).click();
  await page.getByLabel("New email address").fill(newEmail);
  await page.getByLabel("Current password").fill("wrong-password");
  await page.getByRole("button", { name: "Save email", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Invalid password");
  await page.getByLabel("New email address").fill(`another-${user.email}`);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByLabel("New email address").fill(newEmail);
  await page.getByRole("button", { name: "Save email", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Invalid password");
  await page.getByLabel("Current password").fill(user.password);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Save email", exact: true }).click();
  const settings = page.getByRole("region", { name: "Account settings" });
  await expect(settings.getByRole("status")).toContainText(
    "email address has been changed",
  );
  await expect(settings).toContainText(newEmail);
  await expect(settings).toContainText("Email not confirmed");
  await expect
    .poll(async () =>
      (await readMail(request, newEmail)).some(
        (mail) => mail.subject === "Confirm your email",
      ),
    )
    .toBe(true);
  await page.getByRole("link", { name: "Back to spaces" }).click();
  await signOutUser(page);
  await signInUser(page, { ...user, email: newEmail });
});

test("confirmed accounts approve email changes in their current inbox and verify the new address", async ({
  page,
  request,
}) => {
  const user = await signupUser(page);
  const confirmation = await waitForMail(
    request,
    user.email,
    "Confirm your email",
  );
  await page.goto(link(confirmation));
  await expect(page.getByRole("status")).toContainText(
    "Your email is confirmed",
  );
  await page.goto("/account");
  await page.getByRole("button", { name: "Change email", exact: true }).click();
  const newEmail = `changed-${user.email}`;
  await page.getByLabel("New email address").fill(newEmail);
  await expect(page.getByLabel("Current password")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Send confirmation link", exact: true })
    .click();
  const settings = page.getByRole("region", { name: "Account settings" });
  await expect(settings.getByRole("status")).toContainText(
    "Check your current email address",
  );
  await expect(settings).toContainText(user.email);
  await expect(settings).toContainText("Email confirmed");
  const approval = await waitForMail(
    request,
    user.email,
    "Confirm your email change",
  );
  expect(approval.text).toContain(newEmail);
  expect(await readMail(request, newEmail)).toHaveLength(0);
  await page.goto(link(approval));
  await expect(page).toHaveURL(/\/change-email$/);
  await page
    .getByRole("button", { name: "Confirm email change", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "email address has been changed",
  );
  const verification = await waitForMail(
    request,
    newEmail,
    "Confirm your email",
  );
  await page.goto(link(verification));
  await expect(page.getByRole("status")).toContainText(
    "Your email is confirmed",
  );
  await page.goto("/account");
  await expect(settings).toContainText(newEmail);
  await expect(settings).toContainText("Email confirmed");
  await page.goto(link(approval));
  await page
    .getByRole("button", { name: "Confirm email change", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("already used");
});

test("signup stays usable; confirmation and recovery complete through email links", async ({
  page,
  request,
}) => {
  const user = await signupUser(page);
  const reminder = page.getByRole("complementary", {
    name: "Email verification",
  });
  await expect(reminder).toContainText(user.email);
  const confirmation = (await readMail(request, user.email)).find(
    (mail) => mail.subject === "Confirm your email",
  )!;
  const verificationLink = link(confirmation);
  await page.goto(verificationLink);
  await expect(page).toHaveURL(/\/verify-email$/);
  await expect(page.getByRole("status")).toContainText(
    "Your email is confirmed",
  );
  await expect(
    page.getByRole("button", { name: "Confirm email", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Continue to the app" }).click();
  await expect(reminder).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await readMail(request, user.email)).filter(
          (mail) => mail.subject === "Welcome to Will Be Done",
        ).length,
    )
    .toBe(1);

  await signOutUser(page);
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(
    page.getByRole("heading", { name: "Forgot your password?" }),
  ).toBeVisible();
  await page.getByLabel("Email address").fill(user.email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("If an account exists");
  const reset = (await readMail(request, user.email)).find(
    (mail) => mail.subject === "Reset your password",
  )!;
  const resetLink = link(reset);
  await page.goto(resetLink);
  await expect(page).toHaveURL(/\/reset-password$/);
  await page
    .getByLabel("New password", { exact: true })
    .fill("replacement-password-123");
  await page.getByLabel("Confirm new password").fill("wrong-password-123");
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(page.getByRole("alert")).toContainText("Passwords do not match");
  await page
    .getByLabel("Confirm new password")
    .fill("replacement-password-123");
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Your password has been changed",
  );
  await expect
    .poll(async () =>
      (await readMail(request, user.email)).some(
        (mail) => mail.subject === "Your password was changed",
      ),
    )
    .toBe(true);
  await signInUser(page, { ...user, password: "replacement-password-123" });
  await expect(page).toHaveURL(/\/spaces\/?$/);

  await page.goto(resetLink);
  await page
    .getByLabel("New password", { exact: true })
    .fill("another-password-123");
  await page.getByLabel("Confirm new password").fill("another-password-123");
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(page.getByRole("alert")).toContainText("already used");
});

test("invalid and missing links have a recovery path", async ({ page }) => {
  await page.goto("/reset-password");
  await expect(page.getByRole("alert")).toContainText(
    "missing or no longer available",
  );
  await expect(
    page.getByRole("link", { name: "Request a new reset link" }),
  ).toBeVisible();
  await page.goto("/verify-email#token=invalid-token");
  await expect(page.getByRole("alert")).toContainText(
    "invalid, expired, or already used",
  );
  await expect(page).toHaveURL(/\/verify-email$/);
});

test("verification works in a different browser without changing its signed-in account", async ({
  page,
  browser,
  request,
}) => {
  const first = await signupUser(page);
  const mail = (await readMail(request, first.email)).find(
    (mail) => mail.subject === "Confirm your email",
  )!;
  const otherContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  });
  try {
    const other = await otherContext.newPage();
    await other.goto(page.url());
    const second = await signupUser(other);
    const secondId = await other.evaluate(() =>
      localStorage.getItem("user_id"),
    );
    await other.goto(link(mail));
    await expect(other.getByRole("status")).toContainText(
      "Your email is confirmed",
    );
    expect(await other.evaluate(() => localStorage.getItem("user_id"))).toBe(
      secondId,
    );
    await other.getByRole("link", { name: "Continue to the app" }).click();
    await expect(
      other.getByRole("complementary", { name: "Email verification" }),
    ).toContainText(second.email);
  } finally {
    await otherContext.close();
  }
});

test("resetting the signed-in account clears its session without hiding the success message", async ({
  page,
  request,
}) => {
  const user = await signupUser(page);
  await page.goto("/forgot-password");
  await page.getByLabel("Email address").fill(user.email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("If an account exists");
  const mail = (await readMail(request, user.email)).find(
    (message) => message.subject === "Reset your password",
  )!;
  await page.goto(link(mail));
  await page
    .getByLabel("New password", { exact: true })
    .fill("replacement-password-123");
  await page
    .getByLabel("Confirm new password")
    .fill("replacement-password-123");
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Your password has been changed",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("auth_token")),
  ).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("user_id"))).toBeNull();
});
