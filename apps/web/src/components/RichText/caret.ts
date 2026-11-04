import type { MouseEvent } from "react";

// The text offset under a click in a RichTextView, for opening the editor
// with the caret where the user clicked.
export function viewTextOffset(event: MouseEvent) {
  const view =
    event.target instanceof Element
      ? event.target.closest("[data-rich-text-view]")
      : null;
  if (!view) return undefined;
  const caret = caretAt(event.clientX, event.clientY);
  if (!caret || !view.contains(caret.node)) return undefined;
  const range = document.createRange();
  range.setStart(view, 0);
  range.setEnd(caret.node, caret.offset);
  return range.toString().length;
}

const caretAt = (x: number, y: number) => {
  // Safari before 18.2 has only the older caretRangeFromPoint.
  if (typeof document.caretPositionFromPoint === "function") {
    const position = document.caretPositionFromPoint(x, y);
    return position && { node: position.offsetNode, offset: position.offset };
  }
  const range = (document as Document).caretRangeFromPoint(x, y);
  return range && { node: range.startContainer, offset: range.startOffset };
};
