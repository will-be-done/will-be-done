import { NodeHttpServer } from '@effect/platform-node'
import { createServer } from 'node:http'
import { Cause, Deferred, Effect, Exit, Fiber, Scope } from 'effect'
import { type HttpServerError, HttpServerRequest, HttpServerResponse } from 'effect/http'

// Only the selected server may open its fixed Google launch endpoint.
export function validateGoogleAuthLaunch(
  serverUrl: string,
  senderUrl: string,
  launchUrl: string
): string {
  const server = new URL(serverUrl)
  const sender = new URL(senderUrl)
  const launch = new URL(launchUrl)
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(server.hostname)
  const keys = [...launch.searchParams.keys()]
  if (
    (server.protocol !== 'https:' && !(server.protocol === 'http:' && local)) ||
    sender.origin !== server.origin ||
    launch.origin !== server.origin ||
    launch.username ||
    launch.password ||
    launch.hash ||
    launch.pathname !== '/api/auth/google/launch' ||
    keys.length !== 2 ||
    !keys.includes('id') ||
    !keys.includes('launch') ||
    !/^[\w-]{43}$/.test(launch.searchParams.get('id') ?? '') ||
    !/^[\w-]{43}$/.test(launch.searchParams.get('launch') ?? '')
  ) {
    throw new Error('Invalid Google authentication URL')
  }
  return launch.href
}

const RETURN_PAGE =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Will Be Done</title></head><body><h1>Will Be Done</h1><p>Return to Will Be Done to continue. You can close this tab.</p></body></html>'

const RETURN_TIMEOUT_MS = 600_000

let active: { flowId: string; stop: () => void } | null = null

export function stopGoogleAuth(flowId: string): void {
  if (active?.flowId === flowId) active.stop()
}

const returnPage = HttpServerResponse.text(RETURN_PAGE, {
  contentType: 'text/html; charset=utf-8',
  headers: {
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
    connection: 'close'
  }
})

// Serves the flow's return route until the scope closes; closing waits for
// in-flight responses before stopping the server.
const serveReturnRoute = (
  flowId: string,
  onReturn: () => void
): Effect.Effect<
  { readonly port: number; readonly returned: Deferred.Deferred<string | null> },
  HttpServerError.ServeError,
  Scope.Scope
> =>
  Effect.gen(function* () {
    const returned = yield* Deferred.make<string | null>()
    const server = yield* NodeHttpServer.make(() => createServer(), {
      port: 0,
      host: '127.0.0.1'
    })
    yield* server.serve(
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const url = new URL(request.url, 'http://127.0.0.1')
        if (url.pathname !== '/google-auth' || url.searchParams.get('state') !== flowId) {
          return HttpServerResponse.empty({ status: 404 })
        }
        const code = url.searchParams.get('code')
        yield* Deferred.succeed(returned, code && /^[\w-]{43}$/.test(code) ? code : null)
        yield* Effect.sync(onReturn)
        return returnPage
      })
    )
    const port = server.address._tag === 'UnixPathAddress' ? 0 : server.address.port
    return { port, returned }
  })

// Google returns to this loopback listener (RFC 8252), so only the machine
// that completed sign-in receives the code that finishes the flow. A sign-in
// link sent by someone else cannot complete in their app.
export async function listenForGoogleAuth(
  flowId: string,
  onReturn: () => void
): Promise<{ port: number; completion: Promise<string | null>; stop: () => void }> {
  active?.stop()
  const scope = Scope.makeUnsafe()
  const started = await Effect.runPromiseExit(
    serveReturnRoute(flowId, onReturn).pipe(Scope.provide(scope))
  )
  if (Exit.isFailure(started)) {
    await Effect.runPromise(Scope.close(scope, started))
    throw Cause.squash(started.cause)
  }
  const { port, returned } = started.value

  const listening = Effect.runFork(
    Deferred.await(returned).pipe(
      Effect.timeoutOrElse({ duration: RETURN_TIMEOUT_MS, orElse: () => Effect.succeed(null) }),
      Effect.ensuring(Scope.close(scope, Exit.void))
    )
  )
  const stop = (): void => {
    Effect.runFork(Fiber.interrupt(listening))
  }
  active = { flowId, stop }
  listening.addObserver(() => {
    if (active?.stop === stop) active = null
  })
  const completion = Effect.runPromise(Fiber.await(listening)).then((exit) =>
    Exit.isSuccess(exit) ? exit.value : null
  )
  return { port, completion, stop }
}
