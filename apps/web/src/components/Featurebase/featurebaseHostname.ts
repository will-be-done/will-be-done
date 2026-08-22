const FEATUREBASE_DOMAIN = "will-be-done.app";

export function isFeaturebaseHostname(hostname: string): boolean {
  return (
    hostname === FEATUREBASE_DOMAIN ||
    hostname.endsWith(`.${FEATUREBASE_DOMAIN}`)
  );
}
