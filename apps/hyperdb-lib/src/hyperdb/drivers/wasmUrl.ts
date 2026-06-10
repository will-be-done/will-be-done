export function normalizeWasmUrl(url: string): string {
  if (url.startsWith("/@fs/")) {
    return url.slice("/@fs".length);
  }

  return url;
}

export function normalizeWasmFetchUrl(url: string): string {
  if (url.startsWith("/@fs/")) {
    return `file://${url.slice("/@fs".length)}`;
  }

  return url;
}
