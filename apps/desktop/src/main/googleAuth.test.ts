import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { listenForGoogleAuth, stopGoogleAuth, validateGoogleAuthLaunch } from './googleAuth'

const proof = 'a'.repeat(43)
const launch = `https://app.example.com/api/auth/google/launch?id=${proof}&launch=${proof}`
test('opens only the configured server launch URL from its renderer', () => {
  assert.equal(
    validateGoogleAuthLaunch('https://app.example.com', 'https://app.example.com/account', launch),
    launch
  )
  assert.equal(
    validateGoogleAuthLaunch(
      'https://app.example.com',
      'https://app.example.com/account',
      launch.replace('/google/', '/oidc/')
    ),
    launch.replace('/google/', '/oidc/')
  )
  for (const url of [
    launch.replace('/google/', '/unknown/'),
    launch.replace('app.example.com', 'evil.example.com'),
    'file:///tmp/login',
    'javascript:alert(1)',
    `${launch}#fragment`,
    `${launch}&redirect=https://evil.example.com`,
    launch.replace('/launch?', '/callback?')
  ]) {
    assert.throws(() =>
      validateGoogleAuthLaunch('https://app.example.com', 'https://app.example.com/account', url)
    )
  }
  assert.throws(() =>
    validateGoogleAuthLaunch('https://app.example.com', 'https://evil.example.com', launch)
  )
  assert.throws(() =>
    validateGoogleAuthLaunch(
      'http://example.com',
      'http://example.com',
      launch.replace('https://app.example.com', 'http://example.com')
    )
  )
})

test('loopback listener returns only its own flow code', async () => {
  let returned = 0
  const { port, completion } = await listenForGoogleAuth(proof, () => returned++)
  const base = `http://127.0.0.1:${port}/google-auth`
  assert.equal((await fetch(`${base}?state=other&code=${proof}`)).status, 404)
  assert.equal(returned, 0)
  assert.equal((await fetch(`${base}?state=${proof}&code=${proof}`)).status, 200)
  assert.equal(await completion, proof)
  assert.equal(returned, 1)
  await assert.rejects(fetch(`${base}?state=${proof}&code=${proof}`))
})

test('loopback listener resolves without a code after a failed sign-in', async () => {
  const { port, completion } = await listenForGoogleAuth(proof, () => {})
  await fetch(`http://127.0.0.1:${port}/google-auth?state=${proof}`)
  assert.equal(await completion, null)
})

test('a new sign-in replaces the previous listener', async () => {
  const first = await listenForGoogleAuth(proof, () => {})
  const second = await listenForGoogleAuth(proof, () => {})
  assert.equal(await first.completion, null)
  await fetch(`http://127.0.0.1:${second.port}/google-auth?state=${proof}`)
  assert.equal(await second.completion, null)
})

test('cancelling stops only the matching sign-in listener', async () => {
  let returned = 0
  const { port, completion } = await listenForGoogleAuth(proof, () => returned++)
  const base = `http://127.0.0.1:${port}/google-auth`
  stopGoogleAuth('b'.repeat(43))
  assert.equal((await fetch(`${base}?state=other`)).status, 404)
  stopGoogleAuth(proof)
  assert.equal(await completion, null)
  await assert.rejects(fetch(`${base}?state=${proof}`))
  assert.equal(returned, 0)
})
