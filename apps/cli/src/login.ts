import { Console, Deferred, Effect } from "effect";
import { CliError } from "effect/cli";
import { dim, success } from "./output.ts";
import { userError } from "./errors.ts";

export type CallbackResult =
  | { readonly _tag: "Token"; readonly token: string }
  | { readonly _tag: "Denied" }
  | { readonly _tag: "Ignored" };

const page = (message: string) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><title>Will Be Done CLI</title><body style="font-family:system-ui;background:#0a0a0f;color:#e2e8f0;display:grid;place-items:center;height:100vh;margin:0"><p>${message}</p>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );

export const handleCallback = (url: URL, expectedState: string) => {
  if (url.pathname !== "/callback") {
    return {
      result: { _tag: "Ignored" } as const,
      response: new Response("Not found", { status: 404 }),
    };
  }
  if (url.searchParams.get("state") !== expectedState) {
    return {
      result: { _tag: "Ignored" } as const,
      response: page(
        "This login link has expired. Run <code>wbd auth login</code> again.",
      ),
    };
  }
  const token = url.searchParams.get("token");
  if (!token) {
    return {
      result: { _tag: "Denied" } as const,
      response: page("Login cancelled. You can close this tab."),
    };
  }
  return {
    result: { _tag: "Token", token } as const,
    response: page(
      "You're signed in. You can close this tab and return to the terminal.",
    ),
  };
};

const openCommand = (url: string) =>
  process.platform === "darwin"
    ? ["open", url]
    : process.platform === "win32"
      ? ["cmd", "/c", "start", "", url]
      : ["xdg-open", url];

const openBrowser = (url: string) =>
  Effect.try(() => {
    const child = Bun.spawn(openCommand(url), {
      stdout: "ignore",
      stderr: "ignore",
    });
    child.unref();
  }).pipe(
    Effect.as(true),
    Effect.orElseSucceed(() => false),
  );

/** Loopback login: the web app creates a token and redirects it to 127.0.0.1. */
export const browserLogin = Effect.fn(function* (
  server: string,
  options: { readonly openBrowser: boolean },
) {
  const state = crypto.randomUUID();
  const received = yield* Deferred.make<string, CliError.UserError>();

  const listener = yield* Effect.acquireRelease(
    Effect.sync(() =>
      Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch: (request) => {
          const { result, response } = handleCallback(
            new URL(request.url),
            state,
          );
          if (result._tag === "Token") {
            Deferred.doneUnsafe(received, Effect.succeed(result.token));
          } else if (result._tag === "Denied") {
            Deferred.doneUnsafe(
              received,
              Effect.fail(userError("Login was cancelled in the browser")),
            );
          }
          return response;
        },
      }),
    ),
    (listener) => Effect.promise(() => listener.stop()),
  );

  const loginUrl = new URL("/cli-auth", server);
  loginUrl.searchParams.set("port", String(listener.port));
  loginUrl.searchParams.set("state", state);

  if (options.openBrowser && (yield* openBrowser(loginUrl.href))) {
    yield* success("Opened browser for Will Be Done authentication");
    yield* Console.log(dim(`  If it didn't open, visit ${loginUrl.href}`));
  } else {
    yield* Console.log(`Open this URL to sign in:\n  ${loginUrl.href}`);
  }

  return yield* Deferred.await(received).pipe(
    Effect.timeoutOrElse({
      duration: "5 minutes",
      orElse: () => Effect.fail(userError("Timed out waiting for the browser")),
    }),
  );
}, Effect.scoped);
