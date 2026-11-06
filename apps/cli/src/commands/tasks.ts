import { Console, Effect, Option } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import { Api, currentSpaceId, firstSection, resolveProject } from "../api.ts";
import { formatDate, humanDate, parseDate } from "../dates.ts";
import { fail, toUserError } from "../errors.ts";
import {
  bold,
  formatTask,
  isAccessible,
  Json,
  printJson,
  success,
  type Task,
} from "../output.ts";

const taskId = Argument.String("id").pipe(Argument.withDescription("Task id"));

const dateValue = Effect.fn(function* (input: string) {
  const date = parseDate(input, formatDate(new Date()));
  if (!date) {
    return yield* fail(
      `"${input}" is not a date. Use today, tomorrow, or YYYY-MM-DD.`,
    );
  }
  return date;
});

const timeFlag = Flag.String("time").pipe(
  Flag.withDescription("Time in 24-hour HH:mm format"),
  Flag.optional,
);

const report = Effect.fn(function* (message: string, task: Task) {
  if (yield* Json) return yield* printJson(task);
  yield* success(`${message} "${task.title}"`);
  const lines = formatTask(task, {
    accessible: yield* isAccessible,
    today: formatDate(new Date()),
  });
  yield* Console.log(lines[1]);
});

const add = Command.make(
  "add",
  {
    title: Argument.String("title").pipe(
      Argument.withDescription("Task title"),
    ),
    content: Flag.String("content").pipe(
      Flag.withDescription("Task description"),
      Flag.optional,
    ),
    project: Flag.String("project").pipe(
      Flag.withDescription("Project id or name (default: Inbox)"),
      Flag.optional,
    ),
    stash: Flag.Boolean("stash").pipe(
      Flag.withDescription("Add the task to the stash"),
      Flag.withDefault(false),
    ),
    date: Flag.String("date").pipe(
      Flag.withDescription("Schedule date: today, tomorrow, or YYYY-MM-DD"),
      Flag.optional,
    ),
    time: timeFlag,
  },
  Effect.fn(function* (input) {
    const { client } = yield* Api;
    const spaceId = yield* currentSpaceId;
    if (
      input.stash &&
      (Option.isSome(input.date) || Option.isSome(input.project))
    ) {
      return yield* fail("--stash can't be combined with --date or --project");
    }
    if (Option.isSome(input.time) && Option.isNone(input.date)) {
      return yield* fail("--time needs --date");
    }
    const payload = {
      title: input.title,
      ...Option.match(input.content, {
        onNone: () => ({}),
        onSome: (content) => ({ content }),
      }),
    };
    let { task } = input.stash
      ? yield* client.createStashTask(spaceId, { payload })
      : yield* Effect.gen(function* () {
          const project = yield* resolveProject(
            spaceId,
            Option.getOrUndefined(input.project),
          );
          const section = yield* firstSection(spaceId, project.id);
          return yield* client.createSectionTask(spaceId, section.id, {
            payload,
          });
        });
    if (Option.isSome(input.date)) {
      ({ task } = yield* client.scheduleTask(spaceId, task.id, {
        payload: {
          date: yield* dateValue(input.date.value),
          time: Option.getOrNull(input.time),
        },
      }));
    }
    yield* report("Added", task);
  }, Effect.mapError(toUserError)),
).pipe(
  Command.withDescription("Add a task"),
  Command.withExamples([
    {
      command: 'wbd task add "Draft launch notes" --date today',
      description: "Add a task for today",
    },
    {
      command: 'wbd task add "Read paper" --stash',
      description: "Add a task to the stash",
    },
  ]),
);

const view = Command.make(
  "view",
  { id: taskId },
  Effect.fn(function* ({ id }) {
    const { client } = yield* Api;
    const { task } = yield* client.getTask(
      yield* currentSpaceId,
      id,
      undefined,
    );
    if (yield* Json) return yield* printJson(task);
    const today = formatDate(new Date());
    const [, details] = formatTask(task, {
      accessible: yield* isAccessible,
      today,
    });
    yield* Console.log(bold(task.title));
    yield* Console.log(details!.trimStart());
    yield* Console.log(`State: ${task.state}`);
    if (task.scheduledDate) {
      yield* Console.log(`Scheduled: ${humanDate(task.scheduledDate, today)}`);
    }
    if (task.content) yield* Console.log(`\n${task.content}`);
  }, Effect.mapError(toUserError)),
).pipe(Command.withDescription("Show a task"));

const setState = (name: string, state: "todo" | "done", message: string) =>
  Command.make(
    name,
    { id: taskId },
    Effect.fn(function* ({ id }) {
      const { client } = yield* Api;
      const { task } = yield* client.updateTask(yield* currentSpaceId, id, {
        payload: { state },
      });
      yield* report(message, task);
    }, Effect.mapError(toUserError)),
  );

const update = Command.make(
  "update",
  {
    id: taskId,
    title: Flag.String("title").pipe(
      Flag.withDescription("New title"),
      Flag.optional,
    ),
    content: Flag.String("content").pipe(
      Flag.withDescription("New description (empty string clears it)"),
      Flag.optional,
    ),
  },
  Effect.fn(function* ({ id, title, content }) {
    if (Option.isNone(title) && Option.isNone(content)) {
      return yield* fail("Nothing to update. Pass --title or --content.");
    }
    const { client } = yield* Api;
    const { task } = yield* client.updateTask(yield* currentSpaceId, id, {
      payload: {
        ...Option.match(title, {
          onNone: () => ({}),
          onSome: (title) => ({ title }),
        }),
        ...Option.match(content, {
          onNone: () => ({}),
          onSome: (content) => ({ content: content === "" ? null : content }),
        }),
      },
    });
    yield* report("Updated", task);
  }, Effect.mapError(toUserError)),
).pipe(Command.withDescription("Update a task's title or description"));

const schedule = Command.make(
  "schedule",
  {
    id: taskId,
    date: Argument.String("date").pipe(
      Argument.withDescription("today, tomorrow, or YYYY-MM-DD"),
    ),
    time: timeFlag,
  },
  Effect.fn(function* ({ id, date, time }) {
    const { client } = yield* Api;
    const { task } = yield* client.scheduleTask(yield* currentSpaceId, id, {
      payload: { date: yield* dateValue(date), time: Option.getOrNull(time) },
    });
    yield* report("Scheduled", task);
  }, Effect.mapError(toUserError)),
).pipe(Command.withDescription("Schedule a task on a date"));

const unschedule = Command.make(
  "unschedule",
  { id: taskId },
  Effect.fn(function* ({ id }) {
    const { client } = yield* Api;
    const spaceId = yield* currentSpaceId;
    yield* client.clearTaskSchedule(spaceId, id, undefined);
    const { task } = yield* client.getTask(spaceId, id, undefined);
    yield* report("Unscheduled", task);
  }, Effect.mapError(toUserError)),
).pipe(Command.withDescription("Remove a task from its date"));

const remove = Command.make(
  "delete",
  { id: taskId },
  Effect.fn(function* ({ id }) {
    const { client } = yield* Api;
    yield* client.deleteTask(yield* currentSpaceId, id, undefined);
    if (yield* Json) return yield* printJson({ id, deleted: true });
    yield* success(`Deleted task ${id}`);
  }, Effect.mapError(toUserError)),
).pipe(Command.withDescription("Delete a task"));

export const task = Command.make("task").pipe(
  Command.withDescription("Manage tasks"),
  Command.withSubcommands([
    add,
    view,
    setState("done", "done", "Completed").pipe(
      Command.withDescription("Complete a task"),
    ),
    setState("undo", "todo", "Reopened").pipe(
      Command.withDescription("Reopen a completed task"),
    ),
    update,
    schedule,
    unschedule,
    remove,
  ]),
  Command.provide(Api.layer),
);
