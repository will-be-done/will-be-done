import { useEffect } from "react";
import invariant from "tiny-invariant";
import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import { isModelDNDData } from "@/lib/dnd/models";

// Scrolls a row of columns while a dragged item hovers near its left or right
// edge.
export const useHorizontalDragAutoScroll = (
  ref: React.RefObject<HTMLElement | null>,
) => {
  useEffect(() => {
    invariant(ref.current);
    return autoScrollForElements({
      element: ref.current,
      canScroll: ({ source }) => isModelDNDData(source.data),
      getAllowedAxis: () => "horizontal",
      getConfiguration: () => ({ maxScrollSpeed: "fast" }),
    });
  }, [ref]);
};
