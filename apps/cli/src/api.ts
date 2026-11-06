import { Context, Effect, flow, Layer, Option } from "effect";
import { Flag, GlobalFlag } from "effect/cli";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import * as WbdApi from "./generated/WbdApi.ts";
import { fail } from "./errors.ts";
import {
  DEFAULT_SERVER,
  loadToken,
  normalizeServer,
  readConfig,
  type StoredConfig,
} from "./settings.ts";

export const SpaceFlag = GlobalFlag.Setting("space")({
  flag: Flag.String("space").pipe(
    Flag.withDescription("Space id or name (default: `wbd space use`)"),
    Flag.optional,
  ),
});

export const makeClient = Effect.fn(function* (server: string, token: string) {
  const http = (yield* HttpClient.HttpClient).pipe(
    HttpClient.mapRequest(
      flow(
        HttpClientRequest.prependUrl(server),
        HttpClientRequest.bearerToken(token),
        HttpClientRequest.acceptJson,
      ),
    ),
  );
  return WbdApi.make(http);
});

export class Api extends Context.Service<
  Api,
  {
    readonly client: WbdApi.WbdApi;
    readonly server: string;
    readonly config: StoredConfig | undefined;
  }
>()("wbd/Api") {
  static readonly layer = Layer.effect(
    Api,
    Effect.gen(function* () {
      const config = yield* readConfig;
      const server = normalizeServer(
        process.env.WBD_SERVER ?? config?.server ?? DEFAULT_SERVER,
      );
      if (!server) return yield* fail("WBD_SERVER is not a valid URL");
      const token =
        process.env.WBD_TOKEN ??
        (config?.server === server ? yield* loadToken(config) : undefined);
      if (!token) return yield* fail("Not logged in. Run `wbd auth login`.");
      return { client: yield* makeClient(server, token), server, config };
    }),
  ).pipe(Layer.provide(FetchHttpClient.layer));
}

const matches = (
  ref: string,
  item: { id: string; name?: string; title?: string },
) =>
  item.id === ref ||
  (item.name ?? item.title)?.toLowerCase() === ref.toLowerCase();

export const resolveSpace = Effect.fn(function* (ref: string) {
  const { client } = yield* Api;
  const { spaces } = yield* client.listSpaces(undefined);
  const space = spaces.find((space) => matches(ref, space));
  if (!space) return yield* fail(`Space "${ref}" not found`);
  return space;
});

export const currentSpaceId = Effect.gen(function* () {
  const ref = Option.getOrUndefined(yield* SpaceFlag) ?? process.env.WBD_SPACE;
  if (ref) return (yield* resolveSpace(ref)).id;
  const { config } = yield* Api;
  if (config?.spaceId) return config.spaceId;
  return yield* fail("No space selected. Run `wbd space use <space>`.");
});

export const resolveProject = Effect.fn(function* (
  spaceId: string,
  ref: string | undefined,
) {
  const { client } = yield* Api;
  const { projects } = yield* client.listProjects(spaceId, undefined);
  const project = projects.find((project) =>
    ref === undefined ? project.isInbox : matches(ref, project),
  );
  if (!project) return yield* fail(`Project "${ref ?? "Inbox"}" not found`);
  return project;
});

export const firstSection = Effect.fn(function* (
  spaceId: string,
  projectId: string,
) {
  const { client } = yield* Api;
  const { sections } = yield* client.listProjectSections(
    spaceId,
    projectId,
    undefined,
  );
  const section = sections[0];
  if (!section) return yield* fail("The project has no sections");
  return section;
});
