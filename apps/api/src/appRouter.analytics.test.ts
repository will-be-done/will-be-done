import { describe, expect, test } from "bun:test";
import { DB, execSync } from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import type { BackendAnalyticsEvent } from "./analytics";
import { createAppRouter } from "./appRouter";
import { tokensTable, usersTable } from "./slices/authSlice";

describe("app router analytics", () => {
  test("captures successful signup, login, and API token creation", async () => {
    const mainDB = new DB(new BptreeInmemDriver());
    execSync(mainDB.loadTables([usersTable, tokensTable]));

    const events: BackendAnalyticsEvent[] = [];
    const appRouter = createAppRouter({
      mainDB,
      captchaConfig: null,
      analytics: {
        capture: (event) => events.push(event),
        shutdown: async () => {},
      },
    });
    const publicCaller = appRouter.createCaller({ user: null });

    const registered = await publicCaller.register({
      email: "analytics@example.com",
      password: "test-password",
    });
    await publicCaller.login({
      email: "analytics@example.com",
      password: "test-password",
    });
    const authenticatedCaller = appRouter.createCaller({
      user: { id: registered.userId, email: "analytics@example.com" },
    });
    await authenticatedCaller.createToken();

    expect(events).toEqual([
      {
        name: "user_signed_up",
        distinctId: registered.userId,
        properties: { captcha_enabled: false },
      },
      { name: "login_succeeded", distinctId: registered.userId },
      { name: "api_token_created", distinctId: registered.userId },
    ]);
  });
});
