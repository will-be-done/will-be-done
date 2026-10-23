import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

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

let stopActive: (() => void) | null = null

// Google returns to this loopback listener (RFC 8252), so only the machine
// that completed sign-in receives the code that finishes the flow. A sign-in
// link sent by someone else cannot complete in their app.
export async function listenForGoogleAuth(
  flowId: string,
  onReturn: () => void
): Promise<{ port: number; completion: Promise<string | null> }> {
  stopActive?.()
  let resolve!: (code: string | null) => void
  const completion = new Promise<string | null>((r) => (resolve = r))
  const finish = (code: string | null): void => {
    clearTimeout(timer)
    server.close()
    if (stopActive === stop) stopActive = null
    resolve(code)
  }
  const stop = (): void => finish(null)
  const server = createServer((request, response) => {
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
    finish(code && /^[\w-]{43}$/.test(code) ? code : null)
    onReturn()
  })
  const timer = setTimeout(stop, 600_000)
  stopActive = stop
  await new Promise<void>((ready, fail) => {
    server.once('error', fail)
    server.listen(0, '127.0.0.1', ready)
  }).catch((error) => {
    stop()
    throw error
  })
  return { port: (server.address() as AddressInfo).port, completion }
}
