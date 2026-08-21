import { addMinutes, startOfDay } from "date-fns";
import { useEffect, type RefObject } from "react";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import {
  dailyEntryType,
  stashEntryType,
  taskType,
} from "@will-be-done/slices/space";
import {
  isModelDNDData,
  type DndModelData,
} from "@/lib/dnd/models.ts";
import {
  DEFAULT_DURATION_MINUTES,
  grabOffsetMinutes,
  startMinutesFromPointer,
} from "./timeGrid.ts";

export type CalendarMovePreview = {
  taskId: string;
  startMinutes: number;
  durationMinutes: number;
  title: string;
  done: boolean;
  dayTime: number;
};

export function canDropOnTimeGrid(data: unknown): data is DndModelData {
  if (!isModelDNDData(data)) return false;
  return (
    data.modelType === dailyEntryType ||
    data.modelType === stashEntryType ||
    data.modelType === taskType
  );
}

export function previewFromCalendarDrag({
  source,
  clientY,
  columnTop,
  dayTime,
}: {
  source: DndModelData;
  clientY: number;
  columnTop: number;
  dayTime: number;
}): Omit<CalendarMovePreview, "title" | "done"> {
  const durationMinutes =
    source.timelineDurationMinutes ?? DEFAULT_DURATION_MINUTES;
  return {
    taskId: source.modelId,
    durationMinutes,
    dayTime,
    startMinutes: startMinutesFromPointer({
      clientY,
      columnTop,
      grabOffsetMinutes: source.timelineGrabOffsetMinutes ?? 0,
      durationMinutes,
    }),
  };
}

export function startsAtFromPreview(day: Date, startMinutes: number) {
  return addMinutes(startOfDay(day), startMinutes).getTime();
}

export function useLockCalendarScroll(
  locked: boolean,
  scrollRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const node = scrollRef.current;
    if (!locked || !node) return;

    const previousOverflow = node.style.overflow;
    node.style.overflow = "hidden";
    const block = (event: Event) => {
      event.preventDefault();
    };
    node.addEventListener("wheel", block, { passive: false });
    node.addEventListener("touchmove", block, { passive: false });
    return () => {
      node.style.overflow = previousOverflow;
      node.removeEventListener("wheel", block);
      node.removeEventListener("touchmove", block);
    };
  }, [locked, scrollRef]);
}

export function attachTimedEventDrag(
  element: HTMLElement,
  task: {
    id: string;
    title: string;
    state: string;
    durationMinutes?: number;
  },
) {
  const durationMinutes = task.durationMinutes ?? DEFAULT_DURATION_MINUTES;
  return draggable({
    element,
    canDrag: ({ input }) => {
      const target = document.elementFromPoint(input.clientX, input.clientY);
      return !target?.closest("[data-calendar-resize]");
    },
    getInitialData: ({ input }): DndModelData => ({
      modelId: task.id,
      modelType: taskType,
      timelineGrabOffsetMinutes: grabOffsetMinutes(
        input.clientY,
        element.getBoundingClientRect().top,
      ),
      timelineDurationMinutes: durationMinutes,
      timelineTitle: task.title,
      timelineDone: task.state === "done",
    }),
    onGenerateDragPreview: ({ nativeSetDragImage }) => {
      setCustomNativeDragPreview({
        nativeSetDragImage,
        getOffset: () => ({ x: 0, y: 0 }),
        render({ container }) {
          Object.assign(container.style, {
            width: "1px",
            height: "1px",
            opacity: "0",
            overflow: "hidden",
          });
        },
      });
    },
  });
}
