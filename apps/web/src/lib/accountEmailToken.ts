// Capture before router tracing/analytics initialize. Fragments never reach the server.
const tokenPath = ["/verify-email", "/reset-password"].includes(
  window.location.pathname,
)
  ? window.location.pathname
  : null;
let token = tokenPath
  ? (new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "")
  : "";
if (tokenPath && window.location.hash) {
  window.history.replaceState(
    window.history.state,
    "",
    window.location.pathname + window.location.search,
  );
}

export function getAccountEmailToken(path: string): string {
  return path === tokenPath ? token : "";
}

export function clearAccountEmailToken() {
  token = "";
}
