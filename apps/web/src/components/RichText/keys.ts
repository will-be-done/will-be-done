// Tiptap binds formatting to "Mod", which is Cmd on Apple platforms.
const isApple = /Mac|iPhone|iPad|iPod/.test(
  navigator.platform || navigator.userAgent,
);

export const MOD_KEY = isApple ? "⌘" : "Ctrl";
export const ALT_KEY = isApple ? "⌥" : "Alt";
