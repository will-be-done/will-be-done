import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import { preserveOffsetOnSource } from "@atlaskit/pragmatic-drag-and-drop/element/preserve-offset-on-source";
import type { ElementEventPayloadMap } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import type { Input } from "@atlaskit/pragmatic-drag-and-drop/types";

// Native drag images only capture the container's bounds. Leave room for rings
// and outlines painted outside the cloned card.
const previewPadding = 4;

const syncClonedFormControls = (source: HTMLElement, clone: HTMLElement) => {
  const sourceControls = source.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >("input, textarea, select");
  const clonedControls = clone.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >("input, textarea, select");

  sourceControls.forEach((sourceControl, index) => {
    const clonedControl = clonedControls[index];
    if (!clonedControl) return;

    if (
      sourceControl instanceof HTMLTextAreaElement &&
      clonedControl instanceof HTMLTextAreaElement
    ) {
      clonedControl.value = sourceControl.value;
      clonedControl.textContent = sourceControl.value;
      return;
    }

    if (
      sourceControl instanceof HTMLInputElement &&
      clonedControl instanceof HTMLInputElement
    ) {
      clonedControl.value = sourceControl.value;

      if (sourceControl.type === "checkbox" || sourceControl.type === "radio") {
        clonedControl.checked = sourceControl.checked;
      }

      return;
    }

    if (
      sourceControl instanceof HTMLSelectElement &&
      clonedControl instanceof HTMLSelectElement
    ) {
      clonedControl.value = sourceControl.value;
    }
  });
};

const createElementDragPreview = ({
  source,
  rect,
}: {
  source: HTMLElement;
  rect: DOMRect;
}) => {
  const preview = source.cloneNode(true) as HTMLElement;

  syncClonedFormControls(source, preview);
  for (const element of preview.querySelectorAll(
    "[data-drag-preview-exclude]",
  )) {
    element.remove();
  }
  preview.setAttribute("aria-hidden", "true");
  // A source drawn scaled (a zoomed map) keeps its layout size and is scaled
  // the same way, so its text wraps as on screen. The computed size is the
  // unscaled, unrounded one; offsetWidth rounds and can wrap the last word.
  const style = getComputedStyle(source);
  const width = parseFloat(style.width) || rect.width;
  const height = parseFloat(style.height) || rect.height;
  const scale = rect.width / width;
  Object.assign(preview.style, {
    // An absolutely placed source would leave the captured box empty.
    position: "relative",
    left: "0",
    top: "0",
    boxSizing: "border-box",
    width: `${width}px`,
    minWidth: `${width}px`,
    height: `${height}px`,
    margin: "0",
    pointerEvents: "none",
    // Sub-pixel rounding alone would blur the image.
    transform: Math.abs(scale - 1) < 0.01 ? "none" : `scale(${scale})`,
    transformOrigin: "0 0",
  });

  const frame = document.createElement("div");
  Object.assign(frame.style, {
    position: "relative",
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
  frame.appendChild(preview);
  return frame;
};

// Marks a preview that stands for several dragged items.
const createCountBadge = (count: number) => {
  const badge = document.createElement("div");
  badge.textContent = String(count);
  badge.className =
    "absolute -right-1 -top-1 z-20 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-semibold text-white";
  return badge;
};

export const setElementDragPreview = ({
  source,
  input,
  nativeSetDragImage,
  count,
}: {
  source: HTMLElement;
  input: Input;
  nativeSetDragImage: ElementEventPayloadMap["onGenerateDragPreview"]["nativeSetDragImage"];
  count?: number;
}) => {
  const rect = source.getBoundingClientRect();
  const getSourceOffset = preserveOffsetOnSource({ element: source, input });

  setCustomNativeDragPreview({
    nativeSetDragImage,
    getOffset: ({ container }) => {
      const offset = getSourceOffset({ container });
      return { x: offset.x + previewPadding, y: offset.y + previewPadding };
    },
    render: ({ container }) => {
      container.style.padding = `${previewPadding}px`;
      const preview = createElementDragPreview({ source, rect });
      // The frame is positioned, so the badge pins to the card's corner.
      if (count && count > 1) preview.appendChild(createCountBadge(count));
      container.appendChild(preview);
      return () => preview.remove();
    },
  });
};
