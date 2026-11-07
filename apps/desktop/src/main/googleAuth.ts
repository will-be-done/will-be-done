import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Effect, Exit, Fiber } from 'effect'

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

const awaitReturn = (
  server: Server,
  flowId: string,
  onReturn: () => void
): Effect.Effect<string | null> =>
  Effect.callback<string | null>((resume) => {
    server.on('request', (request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== '/google-auth' || url.searchParams.get('state') !== flowId) {
        response.writeHead(404).end()
        return
      }
      response
        .writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'referrer-policy': 'no-referrer',
          connection: 'close'
        })
        .end(RETURN_PAGE)
      const code = url.searchParams.get('code')
      resume(Effect.succeed(code && /^[\w-]{43}$/.test(code) ? code : null))
      onReturn()
    })
  })

// Google returns to this loopback listener (RFC 8252), so only the machine
// that completed sign-in receives the code that finishes the flow. A sign-in
// link sent by someone else cannot complete in their app.
export async function listenForGoogleAuth(
  flowId: string,
  onReturn: () => void
): Promise<{ port: number; completion: Promise<string | null>; stop: () => void }> {
  active?.stop()
  const server = createServer()
  await new Promise<void>((ready, fail) => {
    server.once('error', fail)
    server.listen(0, '127.0.0.1', ready)
  }).catch((error) => {
    server.close()
    throw error
  })

  const listening = Effect.runFork(
    awaitReturn(server, flowId, onReturn).pipe(
      Effect.timeoutOrElse({ duration: RETURN_TIMEOUT_MS, orElse: () => Effect.succeed(null) }),
      Effect.ensuring(Effect.sync(() => server.close()))
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
  return { port: (server.address() as AddressInfo).port, completion, stop }
}
