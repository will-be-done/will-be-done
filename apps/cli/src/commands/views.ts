import { Effect } from "effect";
import { Command, Flag } from "effect/cli";
import { Api, currentSpaceId } from "../api.ts";
import { addDays, formatDate, humanDate } from "../dates.ts";
import { toUserError } from "../errors.ts";
import { Json, printJson, printTaskGroup, type Task } from "../output.ts";

const allScheduled = Effect.fn(function* (
  spaceId: string,
  params: { scope: "overdue" | "upcoming"; relativeTo: string; to?: string },
) {
  const { client } = yield* Api;
  const tasks: Array<Task> = [];
  let cursor: string | null = null;
  do {
    const page: { tasks: ReadonlyArray<Task>; nextCursor: string | null } =
      yield* client.listScheduledTasks(spaceId, {
        params: { ...params, limit: 200, ...(cursor ? { cursor } : {}) },
      });
    tasks.push(...page.tasks);
    cursor = page.nextCursor;
  } while (cursor);
  return tasks;
});

export const today = Command.make(
  "today",
  {},
  Effect.fn(function* () {
    const { client } = yield* Api;
    const spaceId = yield* currentSpaceId;
    const date = formatDate(new Date());
    const [overdue, { items }] = yield* Effect.all(
      [
        allScheduled(spaceId, { scope: "overdue", relativeTo: date }),
        client.listDailyListItems(spaceId, date, { params: { state: "todo" } }),
      ],
      { concurrency: "unbounded" },
    );
    if (yield* Json) return yield* printJson({ overdue, today: items });
    if (overdue.length > 0)
      yield* printTaskGroup("Overdue", overdue, {
        today: date,
        showDate: true,
      });
    yield* printTaskGroup("Today", items, { today: date, showDate: false });
  }, Effect.mapError(toUserError)),
).pipe(
  Command.withDescription("Show tasks scheduled for today and overdue tasks"),
  Command.provide(Api.layer),
);

export const upcoming = Command.make(
  "upcoming",
  {
    days: Flag.Int("days").pipe(
      Flag.withDescription("Number of days to show"),
      Flag.withDefault(7),
    ),
  },
  Effect.fn(function* ({ days }) {
    const spaceId = yield* currentSpaceId;
    const date = formatDate(new Date());
    const tasks = yield* allScheduled(spaceId, {
      scope: "upcoming",
      relativeTo: addDays(date, 1),
      to: addDays(date, Math.max(days, 1)),
    });
    if (yield* Json) return yield* printJson(tasks);
    const byDate = Map.groupBy(tasks, (task) => task.scheduledDate ?? "");
    for (const [scheduledDate, group] of byDate) {
      yield* printTaskGroup(humanDate(scheduledDate, date), group, {
        today: date,
        showDate: false,
      });
    }
  }, Effect.mapError(toUserError)),
).pipe(
  Command.withDescription("Show tasks scheduled for the coming days"),
  Command.provide(Api.layer),
);

export const stash = Command.make(
  "stash",
  {},
  Effect.fn(function* () {
    const { client } = yield* Api;
    const { tasks } = yield* client.listStashTasks(yield* currentSpaceId, {
      params: { state: "todo" },
    });
    if (yield* Json) return yield* printJson(tasks);
    yield* printTaskGroup("Stash", tasks, {
      today: formatDate(new Date()),
      showDate: true,
    });
  }, Effect.mapError(toUserError)),
).pipe(
  Command.withDescription("Show tasks in the stash"),
  Command.provide(Api.layer),
);
