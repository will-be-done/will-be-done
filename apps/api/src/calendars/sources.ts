import { deleteRows, selectFrom, upsert, v } from "@will-be-done/hyperdb";
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

// Connecting an account again replaces its credentials and keeps the user's
// choices: unticked calendars and the sync window.
export const saveCalendarSource = action({
  name: "saveCalendarSource",
  args: { source: calendarSourceRow },
  handler: function* saveCalendarSource({ source }) {
    const current = yield* selectFrom(calendarSourcesTable, "byId")
      .where((q) => q.eq("id", source.id))
      .first();
    yield* upsert(calendarSourcesTable, [
      current
        ? {
            ...source,
            disabledCalendarKeys: current.disabledCalendarKeys,
            ...(current.syncWindow ? { syncWindow: current.syncWindow } : {}),
            createdAt: current.createdAt,
          }
        : source,
    ]);
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

// Reads the stored list inside the transaction so concurrent toggles all land.
export const setCalendarSourceCalendarEnabled = action({
  name: "setCalendarSourceCalendarEnabled",
  args: { id: v.string(), calendarKey: v.string(), enabled: v.boolean() },
  handler: function* setCalendarSourceCalendarEnabled({
    id,
    calendarKey,
    enabled,
  }) {
    const current = yield* selectFrom(calendarSourcesTable, "byId")
      .where((q) => q.eq("id", id))
      .first();
    if (!current) return;
    const disabled = new Set(
      JSON.parse(current.disabledCalendarKeys) as string[],
    );
    if (enabled) disabled.delete(calendarKey);
    else disabled.add(calendarKey);
    yield* upsert(calendarSourcesTable, [
      { ...current, disabledCalendarKeys: JSON.stringify([...disabled]) },
    ]);
  },
});

export const deleteCalendarSourcesBySpace = action({
  name: "deleteCalendarSourcesBySpace",
  args: { spaceId: v.string() },
  handler: function* deleteCalendarSourcesBySpace({ spaceId }) {
    const sources = yield* selectFrom(
      calendarSourcesTable,
      "bySpaceIdCreatedAt",
    ).where((q) => q.eq("spaceId", spaceId));
    if (sources.length > 0) {
      yield* deleteRows(
        calendarSourcesTable,
        sources.map((source) => source.id),
      );
    }
  },
});

export const deleteCalendarSource = action({
  name: "deleteCalendarSource",
  args: { id: v.string() },
  handler: function* deleteCalendarSource({ id }) {
    yield* deleteRows(calendarSourcesTable, [id]);
  },
});
