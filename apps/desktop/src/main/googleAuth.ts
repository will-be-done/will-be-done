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
