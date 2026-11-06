import { Console, Effect } from "effect";
import { Argument, Command } from "effect/cli";
import { Api, currentSpaceId, resolveSpace } from "../api.ts";
import { toUserError } from "../errors.ts";
import { dim, green, Json, printJson, success } from "../output.ts";
import { writeConfig } from "../settings.ts";

const list = Command.make(
  "list",
  {},
  Effect.fn(function* () {
    const { client, config } = yield* Api;
    const { spaces } = yield* client.listSpaces(undefined);
    if (yield* Json) return yield* printJson(spaces);
    for (const space of spaces) {
      const current = space.id === config?.spaceId;
      yield* Console.log(
        `${current ? green("*") : " "} ${space.name}  ${dim(`id:${space.id}`)}`,
      );
    }
  }, Effect.mapError(toUserError)),
).pipe(Command.withDescription("List spaces"), Command.withAlias("ls"));

const use = Command.make(
  "use",
  {
    space: Argument.String("space").pipe(
      Argument.withDescription("Space id or name"),
    ),
  },
  Effect.fn(function* ({ space: ref }) {
    const { config, server } = yield* Api;
    const space = yield* resolveSpace(ref);
    yield* writeConfig({ ...(config ?? { server }), spaceId: space.id });
    yield* success(`Using space "${space.name}"`);
  }, Effect.mapError(toUserError)),
).pipe(Command.withDescription("Set the default space"));

export const space = Command.make("space").pipe(
  Command.withDescription("Manage spaces"),
  Command.withSubcommands([list, use]),
  Command.provide(Api.layer),
);

export const project = Command.make("project").pipe(
  Command.withDescription("Manage projects"),
  Command.withSubcommands([
    Command.make(
      "list",
      {},
      Effect.fn(function* () {
        const { client } = yield* Api;
        const { projects } = yield* client.listProjects(
          yield* currentSpaceId,
          undefined,
        );
        if (yield* Json) return yield* printJson(projects);
        for (const project of projects) {
          yield* Console.log(
            `  ${project.icon ? `${project.icon} ` : ""}${project.title}  ${dim(`id:${project.id}`)}`,
          );
        }
      }, Effect.mapError(toUserError)),
    ).pipe(Command.withDescription("List projects"), Command.withAlias("ls")),
  ]),
  Command.provide(Api.layer),
);
