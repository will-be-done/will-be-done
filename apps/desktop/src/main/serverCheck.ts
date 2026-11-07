import { Data, Effect, Match } from 'effect'
import type { ServerCheckResult } from '@will-be-done/slices/desktop'

const SERVER_CHECK_TIMEOUT_MS = 5000
export const SERVER_CHECK_FILE = '631521eb-a436-4740-9db3-e6f1d72392fe.json'
export const SERVER_CHECK_NONCE = '4f2c9a71-f7bb-4a57-b9b9-6d433c9f5b2e'

class InvalidServerUrl extends Data.TaggedError('InvalidServerUrl')<{
  readonly input: string
  readonly reason: string
}> {}

class ServerUnreachable extends Data.TaggedError('ServerUnreachable')<{
  readonly serverUrl: string
}> {}

class ServerTimeout extends Data.TaggedError('ServerTimeout')<{
  readonly serverUrl: string
}> {}

class ServerCheckStatus extends Data.TaggedError('ServerCheckStatus')<{
  readonly serverUrl: string
  readonly status: number
}> {}

class InvalidCheckFile extends Data.TaggedError('InvalidCheckFile')<{
  readonly serverUrl: string
  readonly problem: 'json' | 'nonce'
}> {}

type ServerCheckError =
  | InvalidServerUrl
  | ServerUnreachable
  | ServerTimeout
  | ServerCheckStatus
  | InvalidCheckFile

export function isHttpUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://')
}

function normalizeServerUrl(url: string): string {
  const normalized = new URL(url.trim())
  if (!isHttpUrl(normalized.toString())) {
    throw new Error('Server URL must use http:// or https://')
  }

  normalized.hash = ''
  return normalized.toString().replace(/\/$/, '')
}

function getServerCheckUrl(serverUrl: string): string {
  return new URL(`/${SERVER_CHECK_FILE}`, `${serverUrl}/`).toString()
}

const fetchCheckFile = (
  serverUrl: string
): Effect.Effect<void, ServerUnreachable | ServerCheckStatus | InvalidCheckFile> =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: (signal) => fetch(getServerCheckUrl(serverUrl), { cache: 'no-store', signal }),
      catch: () => new ServerUnreachable({ serverUrl })
    })
    if (!response.ok) {
      return yield* new ServerCheckStatus({ serverUrl, status: response.status })
    }
    const payload = yield* Effect.tryPromise({
      try: () => response.json() as Promise<{ nonce?: unknown } | null>,
      catch: () => new InvalidCheckFile({ serverUrl, problem: 'json' })
    })
    if (payload?.nonce !== SERVER_CHECK_NONCE) {
      return yield* new InvalidCheckFile({ serverUrl, problem: 'nonce' })
    }
  })

const verifyServer = (input: string, timeoutMs: number): Effect.Effect<string, ServerCheckError> =>
  Effect.gen(function* () {
    const serverUrl = yield* Effect.try({
      try: () => normalizeServerUrl(input),
      catch: (error) =>
        new InvalidServerUrl({
          input,
          reason: error instanceof Error ? error.message : 'Failed to verify the configured server.'
        })
    })
    yield* fetchCheckFile(serverUrl).pipe(
      Effect.timeoutOrElse({
        duration: timeoutMs,
        orElse: () => Effect.fail(new ServerTimeout({ serverUrl }))
      })
    )
    return serverUrl
  })

const failedCheck = Match.type<ServerCheckError>().pipe(
  Match.tagsExhaustive({
    InvalidServerUrl: ({ input, reason }): ServerCheckResult => ({
      ok: false,
      serverUrl: input,
      error: reason
    }),
    ServerUnreachable: ({ serverUrl }): ServerCheckResult => ({
      ok: false,
      serverUrl,
      offline: true,
      error: `Could not reach ${getServerCheckUrl(serverUrl)}. Check the server address and your connection.`
    }),
    ServerTimeout: ({ serverUrl }): ServerCheckResult => ({
      ok: false,
      serverUrl,
      offline: true,
      error: `Timed out while loading ${getServerCheckUrl(serverUrl)}.`
    }),
    ServerCheckStatus: ({ serverUrl, status }): ServerCheckResult => ({
      ok: false,
      serverUrl,
      status,
      error:
        status === 404
          ? `Could not verify ${serverUrl}. The server did not respond with the expected Will Be Done check file.`
          : `Failed to load ${getServerCheckUrl(serverUrl)}. Server responded with status ${status}.`
    }),
    InvalidCheckFile: ({ serverUrl, problem }): ServerCheckResult => ({
      ok: false,
      serverUrl,
      error:
        problem === 'json'
          ? `Could not verify ${serverUrl}. The server check file did not return valid JSON.`
          : `Could not verify ${serverUrl}. The server check file did not contain the expected nonce.`
    })
  })
)

export function checkServerUrl(
  serverUrl: string,
  { timeoutMs = SERVER_CHECK_TIMEOUT_MS } = {}
): Promise<ServerCheckResult> {
  const input = serverUrl.trim()
  return Effect.runPromise(
    verifyServer(input, timeoutMs).pipe(
      Effect.map((url): ServerCheckResult => ({ ok: true, serverUrl: url })),
      Effect.catch((error) => Effect.succeed(failedCheck(error)))
    )
  )
}
