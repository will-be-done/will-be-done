import { Console, Effect } from "effect";
import { Flag, GlobalFlag } from "effect/cli";
import type { GetTask200 } from "./generated/WbdApi.ts";
import { humanDate } from "./dates.ts";

export type Task = GetTask200["task"];

export const Json = GlobalFlag.Setting("json")({
  flag: Flag.Boolean("json").pipe(
    Flag.withDescription("Print machine-readable JSON"),
    Flag.withDefault(false),
  ),
});

export const Accessible = GlobalFlag.Setting("accessible")({
  flag: Flag.Boolean("accessible").pipe(
    Flag.withDescription(
      "Add text labels to color-coded output (also: WBD_ACCESSIBLE=1)",
    ),
    Flag.withDefault(false),
  ),
});

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = (code: number) => (text: string) =>
  useColor ? `\x1b[${code}m${text}\x1b[0m` : text;

export const bold = paint(1);
export const dim = paint(2);
export const red = paint(31);
export const green = paint(32);

export const success = (message: string) =>
  Console.log(`${green("✓")} ${message}`);

export const printJson = (value: unknown) =>
  Console.log(JSON.stringify(value, null, 2));

export const formatDuration = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h${rest}m`;
};

export const formatTask = (
  task: Task,
  options: {
    readonly accessible: boolean;
    readonly today: string;
    readonly showDate?: boolean;
  },
) => {
  const marker =
    task.nature === "red"
      ? red(options.accessible ? "● red" : "●")
      : task.nature === "green"
        ? green(options.accessible ? "● green" : "●")
        : undefined;
  const title =
    task.state === "done" ? `${green("✓")} ${task.title}` : task.title;
  const details = [
    `id:${task.id}`,
    options.showDate !== false &&
      task.scheduledDate &&
      humanDate(task.scheduledDate, options.today),
    task.scheduledTime,
    task.durationMinutes && formatDuration(task.durationMinutes),
    marker,
  ].filter(Boolean);
  return [`  ${title}`, `  ${dim(details.join("  "))}`];
};

export const printTaskGroup = Effect.fn(function* (
  heading: string,
  tasks: ReadonlyArray<Task>,
  options: { readonly today: string; readonly showDate: boolean },
) {
  const accessible = yield* isAccessible;
  yield* Console.log(bold(`${heading} (${tasks.length})`));
  for (const task of tasks) {
    yield* Console.log(formatTask(task, { accessible, ...options }).join("\n"));
  }
});

export const isAccessible = Effect.map(
  Accessible,
  (flag) => flag || process.env.WBD_ACCESSIBLE === "1",
);
