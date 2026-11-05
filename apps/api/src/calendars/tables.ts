import { defineTable, v, type ExtractSchema } from "@will-be-done/hyperdb";

// A space's connection to an external calendar. Lives in the main DB, never
// synced, because it holds credentials.
export const calendarSourcesTable = defineTable("calendar_sources", {
  id: v.string(),
  userId: v.string(),
  spaceId: v.string(),
  kind: v.union(v.literal("caldav"), v.literal("ics")),
  name: v.string(),
  // Encrypted JSON CalendarSourceSecret.
  secret: v.string(),
  // JSON DiscoveredCalendar[] from the last successful sync.
  calendars: v.string(),
  // JSON string[] of calendar keys the user turned off.
  disabledCalendarKeys: v.string(),
  status: v.union(v.literal("pending"), v.literal("ok"), v.literal("error")),
  lastError: v.union(v.string(), v.null()),
  lastSyncedAt: v.union(v.number(), v.null()),
  nextSyncAt: v.number(),
  createdAt: v.number(),
}).index("bySpaceIdCreatedAt", ["spaceId", "createdAt"]);

export type CalendarSource = ExtractSchema<typeof calendarSourcesTable>;

export type CalendarSourceSecret = {
  url: string;
  username?: string;
  password?: string;
};

export type DiscoveredCalendar = {
  key: string;
  name: string;
  color: string | null;
};
