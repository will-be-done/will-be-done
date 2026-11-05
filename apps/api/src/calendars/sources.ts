import {
  deleteRows,
  insert,
  selectFrom,
  upsert,
  v,
} from "@will-be-done/hyperdb";
import { action, selector } from "../builders";
import { calendarSourcesTable, type CalendarSource } from "./tables";

const calendarSourceRow = calendarSourcesTable.v();

// A space has a handful of sources at most.
export const calendarSourcesBySpace = selector({
  name: "calendarSourcesBySpace",
  args: { spaceId: v.string() },
  handler: function* calendarSourcesBySpace({ spaceId }) {
    return yield* selectFrom(calendarSourcesTable, "bySpaceIdCreatedAt").where(
      (q) => q.eq("spaceId", spaceId),
    );
  },
});

export const calendarSourceById = selector({
  name: "calendarSourceById",
  args: { id: v.string() },
  handler: function* calendarSourceById({ id }) {
    return yield* selectFrom(calendarSourcesTable, "byId")
      .where((q) => q.eq("id", id))
      .first();
  },
});

export const insertCalendarSource = action({
  name: "insertCalendarSource",
  args: { source: calendarSourceRow },
  handler: function* insertCalendarSource({ source }) {
    yield* insert(calendarSourcesTable, [source]);
  },
});

// Merges onto the current row so a sync finishing after a user edit keeps it.
export const updateCalendarSource = action({
  name: "updateCalendarSource",
  args: { id: v.string(), patch: v.partial(calendarSourceRow) },
  handler: function* updateCalendarSource({ id, patch }) {
    const current = yield* selectFrom(calendarSourcesTable, "byId")
      .where((q) => q.eq("id", id))
      .first();
    if (!current) return undefined;
    const next: CalendarSource = { ...current, ...patch, id };
    yield* upsert(calendarSourcesTable, [next]);
    return next;
  },
});

export const deleteCalendarSource = action({
  name: "deleteCalendarSource",
  args: { id: v.string() },
  handler: function* deleteCalendarSource({ id }) {
    yield* deleteRows(calendarSourcesTable, [id]);
  },
});
