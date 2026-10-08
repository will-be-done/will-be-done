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
  preview.setAttribute("aria-hidden", "true");
  Object.assign(preview.style, {
    boxSizing: "border-box",
    width: `${rect.width}px`,
    minWidth: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: "0",
    pointerEvents: "none",
    transform: "none",
  });

  return preview;
};

export const setElementDragPreview = ({
  source,
  input,
  nativeSetDragImage,
}: {
  source: HTMLElement;
  input: Input;
  nativeSetDragImage: ElementEventPayloadMap["onGenerateDragPreview"]["nativeSetDragImage"];
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
      container.appendChild(preview);
      return () => preview.remove();
    },
  });
};
