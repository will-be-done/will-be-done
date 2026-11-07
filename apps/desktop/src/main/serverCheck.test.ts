import { strict as assert } from 'node:assert'
import { createServer, type RequestListener } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, test } from 'node:test'
import { checkServerUrl, SERVER_CHECK_FILE, SERVER_CHECK_NONCE } from './serverCheck'

let respond: RequestListener = (_request, response) => response.end()
const server = createServer((request, response) => respond(request, response))
const listening = new Promise<string>((resolve) =>
  server.listen(0, '127.0.0.1', () =>
    resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)
  )
)
after(() => {
  server.closeAllConnections()
  server.close()
})

const serve = (status: number, body: string): RequestListener => {
  return (request, response) => {
    assert.equal(request.url, `/${SERVER_CHECK_FILE}`)
    response.writeHead(status, { 'content-type': 'application/json' }).end(body)
  }
}

test('accepts a server that serves the check file and normalizes its URL', async () => {
  const origin = await listening
  respond = serve(200, JSON.stringify({ nonce: SERVER_CHECK_NONCE }))
  assert.deepEqual(await checkServerUrl(`  ${origin}/#settings `), {
    ok: true,
    serverUrl: origin
  })
})

test('explains why a reachable server is not a Will Be Done server', async () => {
  const origin = await listening
  const checkUrl = `${origin}/${SERVER_CHECK_FILE}`
  const cases = [
    {
      response: serve(404, ''),
      expected: {
        status: 404,
        error: `Could not verify ${origin}. The server did not respond with the expected Will Be Done check file.`
      }
    },
    {
      response: serve(502, ''),
      expected: {
        status: 502,
        error: `Failed to load ${checkUrl}. Server responded with status 502.`
      }
    },
    {
      response: serve(200, '<!doctype html>'),
      expected: {
        error: `Could not verify ${origin}. The server check file did not return valid JSON.`
      }
    },
    {
      response: serve(200, JSON.stringify({ nonce: 'someone-else' })),
      expected: {
        error: `Could not verify ${origin}. The server check file did not contain the expected nonce.`
      }
    },
    {
      response: serve(200, 'null'),
      expected: {
        error: `Could not verify ${origin}. The server check file did not contain the expected nonce.`
      }
    }
  ]
  for (const { response, expected } of cases) {
    respond = response
    assert.deepEqual(await checkServerUrl(origin), { ok: false, serverUrl: origin, ...expected })
  }
})

test('reports an unreachable server as offline', async () => {
  const closed = createServer()
  const port = await new Promise<number>((resolve) =>
    closed.listen(0, '127.0.0.1', () => resolve((closed.address() as AddressInfo).port))
  )
  await new Promise((resolve) => closed.close(resolve))
  const origin = `http://127.0.0.1:${port}`
  assert.deepEqual(await checkServerUrl(origin), {
    ok: false,
    serverUrl: origin,
    offline: true,
    error: `Could not reach ${origin}/${SERVER_CHECK_FILE}. Check the server address and your connection.`
  })
})

test('times out a server that never answers and reports it as offline', async () => {
  const origin = await listening
  respond = () => {}
  assert.deepEqual(await checkServerUrl(origin, { timeoutMs: 20 }), {
    ok: false,
    serverUrl: origin,
    offline: true,
    error: `Timed out while loading ${origin}/${SERVER_CHECK_FILE}.`
  })
  server.closeAllConnections()
})

test('rejects addresses that are not http or https URLs', async () => {
  assert.deepEqual(await checkServerUrl(' ftp://example.com '), {
    ok: false,
    serverUrl: 'ftp://example.com',
    error: 'Server URL must use http:// or https://'
  })
  const unparsable = await checkServerUrl('not a url')
  assert.equal(unparsable.ok, false)
  assert.equal(unparsable.serverUrl, 'not a url')
  assert.ok(!('offline' in unparsable))
})
