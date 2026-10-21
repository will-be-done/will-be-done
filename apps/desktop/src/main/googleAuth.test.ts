import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { validateGoogleAuthLaunch } from './googleAuth'

const proof = 'a'.repeat(43)
const launch = `https://app.example.com/api/auth/google/launch?id=${proof}&launch=${proof}`
test('opens only the configured server launch URL from its renderer', () => {
  assert.equal(
    validateGoogleAuthLaunch('https://app.example.com', 'https://app.example.com/account', launch),
    launch
  )
  for (const url of [
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
