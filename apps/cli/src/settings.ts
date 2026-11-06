import { homedir } from "node:os";
import { Effect, FileSystem, Path, Schema } from "effect";
import { userError } from "./errors.ts";

export const DEFAULT_SERVER = "https://app.will-be-done.app";
const SECRET_SERVICE = "will-be-done-cli";

const StoredConfig = Schema.Struct({
  server: Schema.String,
  spaceId: Schema.optionalKey(Schema.String),
  // Only present when the system keychain is unavailable.
  token: Schema.optionalKey(Schema.String),
});
export type StoredConfig = typeof StoredConfig.Type;

const StoredConfigJson = Schema.fromJsonString(StoredConfig);

const loopbackHost = /^(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/;

export const normalizeServer = (server: string) => {
  const scheme = loopbackHost.test(server) ? "http" : "https";
  const url = URL.parse(
    server.includes("://") ? server : `${scheme}://${server}`,
  );
  if (!url || (url.protocol !== "https:" && url.protocol !== "http:")) {
    return undefined;
  }
  return url.origin;
};

const configFile = Effect.map(Path.Path, (path) => {
  const dir =
    process.env.WBD_CONFIG_DIR ??
    path.join(
      process.env.XDG_CONFIG_HOME ?? path.join(homedir(), ".config"),
      "wbd",
    );
  return path.join(dir, "config.json");
});

export const readConfig = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const file = yield* configFile;
  if (!(yield* fs.exists(file))) return undefined;
  return yield* Schema.decodeEffect(StoredConfigJson)(
    yield* fs.readFileString(file),
  );
}).pipe(
  Effect.mapError((cause) => userError("Could not read the CLI config", cause)),
);

export const writeConfig = Effect.fn(
  function* (config: StoredConfig) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const file = yield* configFile;
    yield* fs.makeDirectory(path.dirname(file), { recursive: true });
    yield* fs.writeFileString(file, `${JSON.stringify(config, null, 2)}\n`, {
      mode: 0o600,
    });
    yield* fs.chmod(file, 0o600);
  },
  Effect.mapError((cause) =>
    userError("Could not write the CLI config", cause),
  ),
);

export const removeConfig = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.remove(yield* configFile, { force: true });
}).pipe(
  Effect.mapError((cause) =>
    userError("Could not remove the CLI config", cause),
  ),
);

export type TokenStore = "keychain" | "file";

/** Saves the token in the OS keychain, falling back to the 0600 config file. */
export const saveCredentials = Effect.fn(function* (
  config: Omit<StoredConfig, "token">,
  token: string,
) {
  const inKeychain = yield* Effect.tryPromise(() =>
    Bun.secrets.set({
      service: SECRET_SERVICE,
      name: config.server,
      value: token,
    }),
  ).pipe(
    Effect.as(true),
    Effect.orElseSucceed(() => false),
  );
  yield* writeConfig(inKeychain ? config : { ...config, token });
  const store: TokenStore = inKeychain ? "keychain" : "file";
  return store;
});

export const loadToken = (config: StoredConfig) =>
  config.token !== undefined
    ? Effect.succeed(config.token)
    : Effect.tryPromise(() =>
        Bun.secrets.get({ service: SECRET_SERVICE, name: config.server }),
      ).pipe(
        Effect.map((token) => token ?? undefined),
        Effect.orElseSucceed(() => undefined),
      );

export const deleteKeychainToken = (server: string) =>
  Effect.tryPromise(() =>
    Bun.secrets.delete({ service: SECRET_SERVICE, name: server }),
  ).pipe(Effect.orElseSucceed(() => false));
