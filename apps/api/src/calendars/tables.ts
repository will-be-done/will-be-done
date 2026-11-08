import { defineTable, v, type ExtractSchema } from "@will-be-done/hyperdb";

export const calendarSyncWindows = [
  "2-weeks",
  "1-month",
  "3-months",
  "6-months",
  "all",
] as const;
export type CalendarSyncWindow = (typeof calendarSyncWindows)[number];

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
  // JSON Record<calendarKey, CalendarSyncCursor> for enabled calendars,
  // describing what the space already mirrors.
  syncCursors: v.optional(v.string()),
  // How far back past events are mirrored; DEFAULT_SYNC_WINDOW when unset.
  syncWindow: v.optional(
    v.union(
      v.literal("2-weeks"),
      v.literal("1-month"),
      v.literal("3-months"),
      v.literal("6-months"),
      v.literal("all"),
    ),
  ),
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

export type CalendarSyncCursor = {
  // Mirror format the cursor was taken with; see MIRROR_VERSION.
  version: number;
  // A different window needs a full re-read, so the cursor no longer applies.
  window: CalendarSyncWindow;
  etag?: string;
  lastModified?: string;
  syncToken?: string;
};

export type DiscoveredCalendar = {
  key: string;
  name: string;
  color: string | null;
};
