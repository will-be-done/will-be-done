// The server the app talks to. Set EXPO_PUBLIC_API_URL for local development,
// e.g. http://10.0.2.2:3000 from the Android emulator.
export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ?? "https://app.will-be-done.app"
).replace(/\/+$/, "");

export const WS_URL = API_URL.replace(/^http/, "ws");
