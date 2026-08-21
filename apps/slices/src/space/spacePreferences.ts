import { insert, selectFrom, upsert, v } from "@will-be-done/hyperdb";
import { action, selector } from "../builders";
import {
  SPACE_PREFERENCES_ID,
  SpacePreferences,
  WorkBreak,
  spacePreferencesTable,
  spacePreferencesType,
} from "./tables";

export const DEFAULT_DAY_START_MINUTES = 9 * 60;
export const DEFAULT_DAY_END_MINUTES = 18 * 60;

export type MinuteInterval = {
  startMinutes: number;
  endMinutes: number;
};

export function clampDayMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return DEFAULT_DAY_START_MINUTES;
  return Math.min(23 * 60 + 45, Math.max(0, Math.round(minutes)));
}

export function minutesToTimeInput(minutes: number): string {
  const clamped = clampDayMinutes(minutes);
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function timeInputToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return DEFAULT_DAY_START_MINUTES;
  }
  return clampDayMinutes(hours * 60 + minutes);
}

export function normalizeWorkBreaks(
  breaks: WorkBreak[] | undefined,
  startMinutes: number,
  endMinutes: number,
): WorkBreak[] {
  return (breaks ?? [])
    .map((item) => {
      const start = Math.max(startMinutes, clampDayMinutes(item.startMinutes));
      const end = Math.min(endMinutes, clampDayMinutes(item.endMinutes));
      return { ...item, startMinutes: start, endMinutes: end };
    })
    .filter((item) => item.endMinutes > item.startMinutes)
    .sort(
      (a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes,
    );
}

export function normalizeWorkday(preferences: SpacePreferences): {
  dayStartMinutes: number;
  dayEndMinutes: number;
  breaks: WorkBreak[];
} {
  const dayStartMinutes = clampDayMinutes(
    preferences.dayStartMinutes ?? DEFAULT_DAY_START_MINUTES,
  );
  let dayEndMinutes = clampDayMinutes(
    preferences.dayEndMinutes ?? DEFAULT_DAY_END_MINUTES,
  );
  if (dayEndMinutes <= dayStartMinutes) {
    dayEndMinutes = Math.min(23 * 60 + 45, dayStartMinutes + 60);
  }
  return {
    dayStartMinutes,
    dayEndMinutes,
    breaks: normalizeWorkBreaks(
      preferences.breaks,
      dayStartMinutes,
      dayEndMinutes,
    ),
  };
}

export const defaultSpacePreferences: SpacePreferences = {
  type: spacePreferencesType,
  id: SPACE_PREFERENCES_ID,
  dayStartMinutes: DEFAULT_DAY_START_MINUTES,
  dayEndMinutes: DEFAULT_DAY_END_MINUTES,
  breaks: [],
};

export const spacePreferences = selector({
  name: "spacePreferences",
  args: {},
  handler: function* spacePreferences(): Generator<
    unknown,
    SpacePreferences,
    unknown
  > {
    const rows = yield* selectFrom(spacePreferencesTable, "byId")
      .where((q) => q.eq("id", SPACE_PREFERENCES_ID))
      .limit(1);
    const row =
      (rows[0] as SpacePreferences | undefined) ?? defaultSpacePreferences;
    const workday = normalizeWorkday(row);
    return {
      type: spacePreferencesType,
      id: SPACE_PREFERENCES_ID,
      ...workday,
    };
  },
});

export const createSpacePreferencesIfNotExists = action({
  name: "createSpacePreferencesIfNotExists",
  args: {},
  handler: function* createSpacePreferencesIfNotExists(): Generator<
    unknown,
    SpacePreferences,
    unknown
  > {
    const rows = yield* selectFrom(spacePreferencesTable, "byId")
      .where((q) => q.eq("id", SPACE_PREFERENCES_ID))
      .limit(1);
    if (rows[0]) return yield* spacePreferences({});

    yield* insert(spacePreferencesTable, [defaultSpacePreferences]);
    return defaultSpacePreferences;
  },
});

const optionalBreaksArg = v.optional(
  v.array(
    v.object({
      id: v.string(),
      startMinutes: v.number(),
      endMinutes: v.number(),
    }),
  ),
);

export const updateSpacePreferences = action({
  name: "updateSpacePreferences",
  args: {
    dayStartMinutes: v.optional(v.number()),
    dayEndMinutes: v.optional(v.number()),
    breaks: optionalBreaksArg,
  },
  handler: function* updateSpacePreferences({
    dayStartMinutes,
    dayEndMinutes,
    breaks,
  }): Generator<unknown, SpacePreferences, unknown> {
    const current = yield* spacePreferences({});
    const workday = normalizeWorkday({
      ...current,
      ...(dayStartMinutes != null ? { dayStartMinutes } : {}),
      ...(dayEndMinutes != null ? { dayEndMinutes } : {}),
      ...(breaks != null ? { breaks } : {}),
    });
    const next: SpacePreferences = {
      type: spacePreferencesType,
      id: SPACE_PREFERENCES_ID,
      ...workday,
    };
    yield* upsert(spacePreferencesTable, [next]);
    return next;
  },
});
