import { homedir } from "node:os";
import { Effect, FileSystem, Path } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import { fail, toUserError } from "../errors.ts";
import { success } from "../output.ts";

const agents = {
  "claude-code": ".claude",
  codex: ".codex",
  universal: ".agents",
} as const;

export const skillMarkdown = `---
name: will-be-done
description: Read and manage the user's Will Be Done tasks (today, upcoming, stash, projects) with the wbd CLI. Use when the user asks about their tasks, schedule, or to add, complete, or reschedule tasks.
---

# Will Be Done CLI

Use \`wbd\` to work with the user's Will Be Done tasks. Always pass \`--json\` when you
need to read results; the human-readable output is for people.

## Reading

- \`wbd today --json\` - overdue tasks and tasks scheduled for today
- \`wbd upcoming --days 7 --json\` - tasks scheduled for the coming days
- \`wbd stash --json\` - unscheduled tasks kept in the stash
- \`wbd task view <id> --json\` - one task, including its description
- \`wbd project list --json\`, \`wbd space list --json\`

## Writing

- \`wbd task add "<title>" [--date today|tomorrow|YYYY-MM-DD] [--time HH:mm] [--project <name|id>] [--content "<text>"]\`
- \`wbd task add "<title>" --stash\` - add to the stash instead of a project
- \`wbd task done <id>\` / \`wbd task undo <id>\`
- \`wbd task schedule <id> <date> [--time HH:mm]\` / \`wbd task unschedule <id>\`
- \`wbd task update <id> [--title "<title>"] [--content "<text>"]\`
- \`wbd task delete <id>\` - ask the user before deleting

Tasks without \`--project\` or \`--stash\` go to the Inbox. Task ids come from \`--json\` output.
Use \`--space <id|name>\` to target a space other than the default.

If a command fails with "Not logged in", ask the user to run \`wbd auth login\`.
`;

const agentArg = Argument.Literals(
  "agent",
  Object.keys(agents) as Array<keyof typeof agents>,
).pipe(Argument.withDescription("Coding agent to install the skill for"));

const localFlag = Flag.Boolean("local").pipe(
  Flag.withDescription(
    "Use the current project instead of your home directory",
  ),
  Flag.withDefault(false),
);

const skillFile = Effect.fn(function* (
  agent: keyof typeof agents,
  local: boolean,
) {
  const path = yield* Path.Path;
  const base = local ? process.cwd() : homedir();
  return path.join(base, agents[agent], "skills", "will-be-done", "SKILL.md");
});

const install = Command.make(
  "install",
  {
    agent: agentArg,
    local: localFlag,
    force: Flag.Boolean("force").pipe(
      Flag.withDescription("Overwrite an existing skill"),
      Flag.withDefault(false),
    ),
  },
  Effect.fn(function* ({ agent, local, force }) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const file = yield* skillFile(agent, local);
    if (!force && (yield* fs.exists(file))) {
      return yield* fail(
        `Skill already installed at ${file}. Use --force to overwrite.`,
      );
    }
    yield* fs.makeDirectory(path.dirname(file), { recursive: true });
    yield* fs.writeFileString(file, skillMarkdown);
    yield* success(`Installed ${agent} skill`);
  }, Effect.mapError(toUserError)),
).pipe(Command.withDescription("Install the wbd skill for a coding agent"));

const uninstall = Command.make(
  "uninstall",
  { agent: agentArg, local: localFlag },
  Effect.fn(function* ({ agent, local }) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const file = yield* skillFile(agent, local);
    if (!(yield* fs.exists(file)))
      return yield* fail(`No ${agent} skill installed`);
    yield* fs.remove(path.dirname(file), { recursive: true });
    yield* success(`Uninstalled ${agent} skill`);
  }, Effect.mapError(toUserError)),
).pipe(Command.withDescription("Remove the wbd skill from a coding agent"));

export const skill = Command.make("skill").pipe(
  Command.withDescription("Manage coding agent skills"),
  Command.withSubcommands([install, uninstall]),
);
