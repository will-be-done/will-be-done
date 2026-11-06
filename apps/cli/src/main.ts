#!/usr/bin/env bun
import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Effect } from "effect";
import { Command } from "effect/cli";
import packageJson from "../package.json" with { type: "json" };
import { SpaceFlag } from "./api.ts";
import { auth } from "./commands/auth.ts";
import { project, space } from "./commands/spaces.ts";
import { skill } from "./commands/skill.ts";
import { task } from "./commands/tasks.ts";
import { stash, today, upcoming } from "./commands/views.ts";
import { Accessible, Json } from "./output.ts";

const wbd = Command.make("wbd").pipe(
  Command.withDescription("Will Be Done CLI"),
  Command.withSubcommands([
    today,
    upcoming,
    stash,
    task,
    project,
    space,
    auth,
    skill,
  ]),
  Command.withGlobalFlags([Json, Accessible, SpaceFlag]),
);

wbd.pipe(
  Command.run({ version: packageJson.version }),
  Effect.provide(BunServices.layer),
  BunRuntime.runMain,
);
