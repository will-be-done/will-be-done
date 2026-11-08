import { randomUUID } from "node:crypto";
import { format } from "date-fns";
import { expect, test, type Page } from "playwright/test";
import {
  createSpace,
  openSpace,
  openSpaceSettings,
  signupUser,
  uniqueE2EName,
  waitForSpaceOnServer,
} from "./helpers";

const caldavUrl = `http://127.0.0.1:${process.env.PLAYWRIGHT_CALDAV_PORT ?? "5233"}`;

// A Radicale user of its own per test, so parallel tests never share calendars.
// The address doubles as the account's email for invitation replies.
function radicaleCalendar() {
  const user = `e2e-${randomUUID()}@example.com`;
  const auth = `Basic ${Buffer.from(`${user}:secret`).toString("base64")}`;
  const calendarUrl = `${caldavUrl}/${user}/work/`;

  const send = async (method: string, url: string, body?: string) => {
    const response = await fetch(url, {
      method,
      headers: {
        authorization: auth,
        "content-type": method === "PUT" ? "text/calendar" : "application/xml",
      },
      body,
    });
    expect(response.ok, `${method} ${url}: ${response.status}`).toBe(true);
  };

  const icsTime = (date: Date) =>
    date
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");

  return {
    user,
    create: () =>
      send(
        "MKCALENDAR",
        calendarUrl,
        `<?xml version="1.0" encoding="utf-8"?><c:mkcalendar xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:set><d:prop><d:displayname>Work</d:displayname></d:prop></d:set></c:mkcalendar>`,
      ),
    putEvent: (
      uid: string,
      title: string,
      start: Date,
      end: Date,
      ...extra: string[]
    ) =>
      send(
        "PUT",
        `${calendarUrl}${uid}.ics`,
        [
          "BEGIN:VCALENDAR",
          "VERSION:2.0",
          "PRODID:-//Will Be Done//E2E//EN",
          "BEGIN:VEVENT",
          `UID:${uid}`,
          `DTSTAMP:${icsTime(new Date())}`,
          `DTSTART:${icsTime(start)}`,
          `DTEND:${icsTime(end)}`,
          `SUMMARY:${title}`,
          ...extra,
          "END:VEVENT",
          "END:VCALENDAR",
          "",
        ].join("\r\n"),
      ),
    deleteEvent: (uid: string) => send("DELETE", `${calendarUrl}${uid}.ics`),
  };
}

// Settings live in the projects sidebar; the calendar page has none.
async function refreshCalendars(page: Page) {
  await page.getByRole("link", { name: "projects", exact: true }).click();
  const settings = await openSpaceSettings(page);
  await settings.getByRole("button", { name: "Calendars" }).click();
  const refreshed = page.waitForResponse(
    (response) => response.url().includes("calendars.refresh") && response.ok(),
  );
  await settings.getByRole("button", { name: "Refresh calendar" }).click();
  await refreshed;
  await settings.getByRole("button", { name: "Close settings" }).click();
  await page.getByRole("link", { name: "calendar", exact: true }).click();
}

test("shows CalDAV events and follows their changes on the server", async ({
  page,
}) => {
  const spaceName = uniqueE2EName("Calendar Events Space");
  const title = uniqueE2EName("Design review");
  const renamed = uniqueE2EName("Design review moved");
  const declined = uniqueE2EName("Declined invite");
  const today = format(new Date(), "yyyy-MM-dd");
  const start = new Date();
  start.setHours(10, 0, 0, 0);
  const end = new Date(start);
  end.setHours(11);

  const radicale = radicaleCalendar();
  await radicale.create();
  await radicale.putEvent(
    "review",
    title,
    start,
    end,
    "DESCRIPTION:Agenda: https://example.zoom.us/j/123",
  );
  await radicale.putEvent(
    "declined",
    declined,
    start,
    end,
    "ORGANIZER:mailto:boss@example.com",
    `ATTENDEE;PARTSTAT=DECLINED:mailto:${radicale.user}`,
  );

  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);
  await waitForSpaceOnServer(page);

  const settings = await openSpaceSettings(page);
  await settings.getByRole("button", { name: "Calendars" }).click();
  await settings.getByPlaceholder(/^Server address/).fill(caldavUrl);
  await settings.getByPlaceholder("Username or email").fill(radicale.user);
  await settings.getByPlaceholder("App password").fill("secret");
  await settings.getByRole("button", { name: "Connect" }).click();
  await expect(settings.getByLabel("Work")).toBeChecked();
  await settings.getByRole("button", { name: "Close settings" }).click();

  const todayEvent = (text: string) =>
    page.locator("[data-external-event]", { hasText: text });
  await expect(todayEvent(title)).toContainText("10:00");

  await page.getByRole("link", { name: "calendar", exact: true }).click();
  const gridEvent = (text: string) =>
    page
      .locator(`[data-calendar-grid][data-calendar-date="${today}"]`)
      .locator("[data-external-event]", { hasText: text });
  await expect(gridEvent(title)).toBeVisible();
  await expect(gridEvent(declined)).toHaveCount(0);

  await gridEvent(title).click();
  const details = page.locator("[data-external-event-details]");
  await expect(details).toContainText(title);
  await expect(
    details.getByRole("link", { name: "Join meeting" }),
  ).toHaveAttribute("href", "https://example.zoom.us/j/123");
  await page.keyboard.press("Escape");
  await expect(details).toHaveCount(0);

  await radicale.putEvent("review", renamed, start, end);
  await refreshCalendars(page);
  await expect(gridEvent(renamed)).toBeVisible();
  await expect(gridEvent(title)).toHaveCount(0);

  await radicale.deleteEvent("review");
  await refreshCalendars(page);
  await expect(gridEvent(renamed)).toHaveCount(0);
});
