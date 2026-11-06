import { Console, Effect, Option, Redacted } from "effect";
import { Argument, Command, Flag, Prompt } from "effect/cli";
import { FetchHttpClient } from "effect/http";
import { Api, makeClient } from "../api.ts";
import { fail, toUserError } from "../errors.ts";
import { browserLogin } from "../login.ts";
import { dim, success } from "../output.ts";
import {
  DEFAULT_SERVER,
  deleteKeychainToken,
  normalizeServer,
  readConfig,
  removeConfig,
  saveCredentials,
} from "../settings.ts";

const serverFlag = Flag.String("server").pipe(
  Flag.withDescription(`Will Be Done server URL (default: ${DEFAULT_SERVER})`),
  Flag.optional,
);

const resolveServer = Effect.fn(function* (flag: Option.Option<string>) {
  const config = yield* readConfig;
  const raw = Option.getOrUndefined(flag) ?? config?.server ?? DEFAULT_SERVER;
  const server = normalizeServer(raw);
  if (!server) return yield* fail(`"${raw}" is not a valid server URL`);
  return server;
});

const storeToken = Effect.fn(function* (server: string, token: string) {
  const client = yield* makeClient(server, token).pipe(
    Effect.provide(FetchHttpClient.layer),
  );
  const { spaces } = yield* client.listSpaces(undefined);
  const previous = yield* readConfig;
  const keepSpace =
    previous?.server === server &&
    spaces.some((space) => space.id === previous.spaceId);
  const space = keepSpace
    ? spaces.find((space) => space.id === previous.spaceId)
    : spaces[0];
  if (previous && previous.server !== server) {
    yield* deleteKeychainToken(previous.server);
  }
  const store = yield* saveCredentials(
    { server, ...(space ? { spaceId: space.id } : {}) },
    token,
  );
  yield* success(
    store === "keychain"
      ? "Credentials saved to secure storage"
      : "Credentials saved to the config file (no system keychain available)",
  );
  if (space) {
    yield* Console.log(
      dim(`  Using space "${space.name}". Change it with \`wbd space use\`.`),
    );
  }
});

const login = Command.make(
  "login",
  {
    server: serverFlag,
    noBrowser: Flag.Boolean("no-browser").pipe(
      Flag.withDescription("Print the login URL instead of opening a browser"),
      Flag.withDefault(false),
    ),
  },
  Effect.fn(function* ({ server: serverOption, noBrowser }) {
    const server = yield* resolveServer(serverOption);
    const token = yield* browserLogin(server, { openBrowser: !noBrowser });
    yield* storeToken(server, token);
  }, Effect.mapError(toUserError)),
).pipe(Command.withDescription("Sign in through the browser"));

const token = Command.make(
  "token",
  {
    server: serverFlag,
    token: Argument.Redacted("token").pipe(
      Argument.withDescription("API token from Space settings → API tokens"),
      Argument.withFallbackPrompt(Prompt.Password({ message: "API token" })),
    ),
  },
  Effect.fn(function* ({ server: serverOption, token }) {
    const server = yield* resolveServer(serverOption);
    yield* storeToken(server, Redacted.value(token));
  }, Effect.mapError(toUserError)),
).pipe(Command.withDescription("Sign in with an existing API token"));

const status = Command.make(
  "status",
  {},
  Effect.fn(function* () {
    const { client, server } = yield* Api;
    const { spaces } = yield* client.listSpaces(undefined);
    yield* success(`Signed in to ${server}`);
    yield* Console.log(dim(`  ${spaces.length} space(s) available`));
  }, Effect.mapError(toUserError)),
).pipe(
  Command.withDescription("Show the current authentication status"),
  Command.provide(Api.layer),
);

const logout = Command.make(
  "logout",
  {},
  Effect.fn(function* () {
    const config = yield* readConfig;
    if (!config) return yield* success("Already signed out");
    yield* deleteKeychainToken(config.server);
    yield* removeConfig;
    yield* success("Signed out");
    yield* Console.log(
      dim(
        "  The token stays valid until you delete it in Space settings → API tokens.",
      ),
    );
  }, Effect.mapError(toUserError)),
).pipe(Command.withDescription("Remove saved credentials"));

export const auth = Command.make("auth").pipe(
  Command.withDescription("Manage authentication"),
  Command.withSubcommands([login, token, status, logout]),
);
