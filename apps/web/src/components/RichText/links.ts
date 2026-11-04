import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

const SAFE_SCHEME = /^(?:https?|mailto|tel):/i;
const ANY_SCHEME = /^[a-z][a-z\d+.-]*:/i;

// The href a stored link opens, or undefined for schemes such as
// `javascript:` that must not be followed.
export function linkHref(href: string, text = "") {
  if (!href) return undefined;
  // Bare www. links get a secure scheme, as linkified text did before.
  if (href === `http://${text}` && text.startsWith("www.")) {
    return `https://${text}`;
  }
  if (SAFE_SCHEME.test(href)) return href;
  if (ANY_SCHEME.test(href)) return undefined;
  if (/^[/#?.]/.test(href)) return href;
  return `https://${href}`;
}

// Opens links on click while editing; Shift and Alt clicks still select.
export const LinkClick = Extension.create({
  name: "linkClick",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("linkClick"),
        props: {
          handleClick: (view, _pos, event) => {
            if (event.button !== 0 || event.shiftKey || event.altKey) {
              return false;
            }
            const anchor =
              event.target instanceof Element
                ? event.target.closest("a[href]")
                : null;
            if (!anchor || !view.dom.contains(anchor)) return false;
            const href = linkHref(
              anchor.getAttribute("href") ?? "",
              anchor.textContent ?? "",
            );
            if (!href) return false;
            window.open(href, "_blank", "noopener,noreferrer");
            return true;
          },
        },
      }),
    ];
  },
});
