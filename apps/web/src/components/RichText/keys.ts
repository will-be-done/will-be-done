// Tiptap binds formatting to "Mod", which is Cmd on Apple platforms.
const isApple = /Mac|iPhone|iPad|iPod/.test(
  navigator.platform || navigator.userAgent,
);

export const MOD_KEY = isApple ? "⌘" : "Ctrl";
export const ALT_KEY = isApple ? "⌥" : "Alt";

type ModifierEvent = { ctrlKey: boolean; metaKey: boolean };

// Cmd on Apple platforms, where Ctrl keeps working for shortcuts that used it
// before; Ctrl elsewhere.
export const hasModKey = (event: ModifierEvent) =>
  isApple ? event.metaKey || event.ctrlKey : event.ctrlKey;

// Ctrl-click opens the context menu on macOS.
export const hasModClick = (event: ModifierEvent) =>
  isApple ? event.metaKey : event.ctrlKey;
