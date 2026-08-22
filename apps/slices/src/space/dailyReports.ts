import {
  deleteRows,
  insert,
  selectFrom,
  upsert,
  v,
} from "@will-be-done/hyperdb";
import { action, selector } from "../builders";
import { genUUIDV5 } from "../traits";
import { dailyListByDate } from "./dailyLists";
import { dailyListTasksByState } from "./dailyEntries";
import { registerModelSlice } from "./maps";
import {
  DailyReport,
  DailyReportCompletedTask,
  DailyReportRating,
  dailyReportCompletedTask,
  dailyReportRating,
  dailyReportsTable,
  dailyReportType,
  possibleModelType,
} from "./tables";

const optionalRatingArg = v.optional(v.union(dailyReportRating, v.null()));

export const defaultDailyReport: DailyReport = {
  type: dailyReportType,
  id: "default-daily-report-id",
  date: "",
  notes: "",
  completedTasks: [],
  createdAt: 0,
  updatedAt: 0,
};

const isDailyReportRating = (value: number): value is DailyReportRating =>
  value === 1 || value === 2 || value === 3 || value === 4 || value === 5;

const resolvedRating = (
  next: number | null | undefined,
  current: DailyReportRating | undefined,
): DailyReportRating | undefined => {
  if (next === null) return undefined;
  if (next === undefined) return current;
  if (!isDailyReportRating(next)) {
    throw new Error("Rating must be an integer from 1 to 5");
  }
  return next;
};

const withOptionalRating = (
  report: DailyReport,
  key: "mood" | "energy" | "focus" | "accomplishment",
  value: DailyReportRating | undefined,
): DailyReport => {
  if (value === undefined) {
    const next = { ...report };
    delete next[key];
    return next;
  }
  return { ...report, [key]: value };
};

export const dailyReportById = selector({
  name: "dailyReportById",
  args: { id: v.string() },
  handler: function* dailyReportById({ id }) {
    const dailyReports = yield* selectFrom(dailyReportsTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1);
    return dailyReports[0] as DailyReport | undefined;
  },
});

export const dailyReportByDate = selector({
  name: "dailyReportByDate",
  args: { date: v.string() },
  handler: function* dailyReportByDate({ date }) {
    const dailyReports = yield* selectFrom(dailyReportsTable, "byDate")
      .where((q) => q.eq("date", date))
      .limit(1);
    return dailyReports[0] as DailyReport | undefined;
  },
});

export const allDailyReports = selector({
  name: "allDailyReports",
  args: {},
  handler: function* allDailyReports() {
    return (yield* selectFrom(dailyReportsTable, "byIds")) as DailyReport[];
  },
});

export const dailyReportsNewest = selector({
  name: "dailyReportsNewest",
  args: {},
  handler: function* dailyReportsNewest() {
    return (yield* selectFrom(dailyReportsTable, "byDateOrdered").order(
      "desc",
    )) as DailyReport[];
  },
});

export const completedTasksSnapshotForDate = selector({
  name: "completedTasksSnapshotForDate",
  args: { date: v.string() },
  handler: function* completedTasksSnapshotForDate({ date }) {
    const dailyList = yield* dailyListByDate({ date });
    if (!dailyList) return [] as DailyReportCompletedTask[];

    const tasks = yield* dailyListTasksByState({
      dailyListId: dailyList.id,
      state: "done",
    });
    return tasks.map((task) => ({ id: task.id, title: task.title }));
  },
});

export const dailyReportsInDateRange = selector({
  name: "dailyReportsInDateRange",
  args: {
    from: v.string(),
    to: v.string(),
    cursorDate: v.union(v.string(), v.null()),
    cursorId: v.union(v.string(), v.null()),
    limit: v.number(),
  },
  handler: function* dailyReportsInDateRange({
    from,
    to,
    cursorDate,
    cursorId,
    limit,
  }) {
    if (cursorDate !== null && (cursorDate < from || cursorDate > to)) {
      return [] as DailyReport[];
    }

    const query = selectFrom(dailyReportsTable, "byDateOrdered").order("desc");
    if (cursorDate === null || cursorId === null) {
      return (yield* query
        .where((q) => q.gte("date", from).lte("date", to))
        .limit(limit)) as DailyReport[];
    }

    const remainingAtCursor = (yield* query
      .where((q) => q.eq("date", cursorDate).lte("id", cursorId))
      .limit(limit + 1)) as DailyReport[];
    const page =
      remainingAtCursor[0]?.id === cursorId
        ? remainingAtCursor.slice(1)
        : remainingAtCursor.slice(0, limit);

    if (page.length < limit) {
      page.push(
        ...((yield* selectFrom(dailyReportsTable, "byDateOrdered")
          .where((q) => q.lt("date", cursorDate).gte("date", from))
          .order("desc")
          .limit(limit - page.length)) as DailyReport[]),
      );
    }
    return page;
  },
});

export const dailyReportGetId = selector({
  name: "dailyReportGetId",
  args: { date: v.string() },
  handler: function* dailyReportGetId({ date }) {
    return yield* genUUIDV5(dailyReportType, date);
  },
});

export const dailyReportCanDrop = selector({
  name: "dailyReportCanDrop",
  args: {
    _dailyReportId: v.string(),
    _dropId: v.string(),
    _dropModelType: possibleModelType,
  },
  handler: function* dailyReportCanDrop() {
    return false;
  },
});

export const createDailyReport = action({
  name: "createDailyReport",
  args: {
    date: v.string(),
    notes: v.optional(v.string()),
    completedTasks: v.optional(v.array(dailyReportCompletedTask)),
    mood: optionalRatingArg,
    energy: optionalRatingArg,
    focus: optionalRatingArg,
    accomplishment: optionalRatingArg,
  },
  handler: function* createDailyReport({
    date,
    notes,
    completedTasks,
    mood,
    energy,
    focus,
    accomplishment,
  }) {
    const existing = yield* dailyReportByDate({ date });
    if (existing) return existing;

    const now = Date.now();
    const resolvedCompletedTasks =
      completedTasks ?? (yield* completedTasksSnapshotForDate({ date }));
    let dailyReport: DailyReport = {
      type: dailyReportType,
      id: yield* dailyReportGetId({ date }),
      date,
      notes: notes ?? "",
      completedTasks: resolvedCompletedTasks,
      createdAt: now,
      updatedAt: now,
    };
    dailyReport = withOptionalRating(
      dailyReport,
      "mood",
      resolvedRating(mood, undefined),
    );
    dailyReport = withOptionalRating(
      dailyReport,
      "energy",
      resolvedRating(energy, undefined),
    );
    dailyReport = withOptionalRating(
      dailyReport,
      "focus",
      resolvedRating(focus, undefined),
    );
    dailyReport = withOptionalRating(
      dailyReport,
      "accomplishment",
      resolvedRating(accomplishment, undefined),
    );

    yield* insert(dailyReportsTable, [dailyReport]);
    return dailyReport;
  },
});

export const upsertDailyReport = action({
  name: "upsertDailyReport",
  args: {
    date: v.string(),
    notes: v.optional(v.string()),
    completedTasks: v.optional(v.array(dailyReportCompletedTask)),
    mood: optionalRatingArg,
    energy: optionalRatingArg,
    focus: optionalRatingArg,
    accomplishment: optionalRatingArg,
  },
  handler: function* upsertDailyReport({
    date,
    notes,
    completedTasks,
    mood,
    energy,
    focus,
    accomplishment,
  }) {
    const existing = yield* dailyReportByDate({ date });
    const now = Date.now();
    const resolvedCompletedTasks =
      completedTasks ??
      existing?.completedTasks ??
      (yield* completedTasksSnapshotForDate({ date }));

    let dailyReport: DailyReport = {
      type: dailyReportType,
      id: existing?.id ?? (yield* dailyReportGetId({ date })),
      date,
      notes: notes ?? existing?.notes ?? "",
      completedTasks: resolvedCompletedTasks,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    dailyReport = withOptionalRating(
      dailyReport,
      "mood",
      resolvedRating(mood, existing?.mood),
    );
    dailyReport = withOptionalRating(
      dailyReport,
      "energy",
      resolvedRating(energy, existing?.energy),
    );
    dailyReport = withOptionalRating(
      dailyReport,
      "focus",
      resolvedRating(focus, existing?.focus),
    );
    dailyReport = withOptionalRating(
      dailyReport,
      "accomplishment",
      resolvedRating(accomplishment, existing?.accomplishment),
    );

    yield* upsert(dailyReportsTable, [dailyReport]);
    return dailyReport;
  },
});

export const deleteDailyReports = action({
  name: "deleteDailyReports",
  args: { ids: v.array(v.string()) },
  handler: function* deleteDailyReports({ ids }) {
    yield* deleteRows(dailyReportsTable, ids);
  },
});

export const deleteDailyReportByDate = action({
  name: "deleteDailyReportByDate",
  args: { date: v.string() },
  handler: function* deleteDailyReportByDate({ date }) {
    const existing = yield* dailyReportByDate({ date });
    if (!existing) return;
    yield* deleteDailyReports({ ids: [existing.id] });
  },
});

export const dailyReportHandleDrop = action({
  name: "dailyReportHandleDrop",
  args: {
    _dailyReportId: v.string(),
    _dropId: v.string(),
    _dropModelType: possibleModelType,
    _edge: v.union(v.literal("top"), v.literal("bottom")),
  },
  handler: function* dailyReportHandleDrop() {},
});

const dailyReportsSlice = {
  byId: dailyReportById,
  delete: deleteDailyReports,
  handleDrop: dailyReportHandleDrop,
  canDrop: dailyReportCanDrop,
};
registerModelSlice(dailyReportsSlice, dailyReportsTable, dailyReportType);
