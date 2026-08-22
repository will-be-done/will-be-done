const TAWK_DOMAIN = "will-be-done.app";

export function isTawkHostname(hostname: string): boolean {
  return hostname === TAWK_DOMAIN || hostname.endsWith(`.${TAWK_DOMAIN}`);
}
