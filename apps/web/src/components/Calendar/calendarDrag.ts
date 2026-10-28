import { create } from "zustand";
import {
  type CalendarEvent,
  blockMinutes,
  isDraggable,
  minutesInDay,
  minutesToTime,
  snapMinutes,
  snapToGrid,
  timeToMinutes,
} from "./calendarModel";

// DOM contract read while dragging:
//   data-calendar-date="yyyy-MM-dd"  a day cell or all-day row; dropping
//                                    there changes the date only
//   data-calendar-untimed           with the above, dropping clears the time
//   data-calendar-grid              with the above, a 24h time column whose
//                                    height maps to the day's minutes
const dateAttr = "data-calendar-date";

export type DragTarget = { date: string; time: string | null | undefined };

export type CalendarDrag = {
  event: CalendarEvent;
  mode: "move" | "resize";
  x: number;
  y: number;
  // undefined time keeps the event's time (month and plan cells).
  target: DragTarget | null;
  durationMinutes: number;
  // Dragged by pragmatic-drag-and-drop from outside the calendar (e.g. the
  // projects view); the browser draws its own drag preview.
  isNative?: boolean;
};

export type DragCommit = (drag: CalendarDrag) => void;

export const useCalendarDrag = create<{ drag: CalendarDrag | null }>(() => ({
  drag: null,
}));

// True while a dragged card hovers this day cell (time undefined) or
// all-day row (time null).
export const useIsDropTarget = (date: string, time: null | undefined) =>
  useCalendarDrag(
    (s) =>
      s.drag?.mode === "move" &&
      s.drag.target?.date === date &&
      s.drag.target.time === time,
  );

const activationDistance = 4;

function gridMinutes(column: Element, clientY: number): number {
  const rect = column.getBoundingClientRect();
  return ((clientY - rect.top) / rect.height) * minutesInDay;
}

const timedOrUntimed = "[data-calendar-grid], [data-calendar-untimed]";

export function findTarget(
  drag: CalendarDrag,
  x: number,
  y: number,
  grabOffsetMinutes: number,
): DragTarget | null {
  const el = document
    .elementsFromPoint(x, y)
    .find((node) => node.hasAttribute(dateAttr));
  if (!el) return null;

  const date = el.getAttribute(dateAttr)!;
  // A template's days come from its rule; only its time can change, and
  // month or plan cells carry no time.
  if (
    drag.event.isProjected &&
    (date !== drag.event.date || !el.matches(timedOrUntimed))
  ) {
    return null;
  }
  if (el.hasAttribute("data-calendar-grid")) {
    // Keep the whole block inside the day.
    const latest = Math.max(0, minutesInDay - blockMinutes(drag.event));
    const start = snapToGrid(gridMinutes(el, y) - grabOffsetMinutes);
    return {
      date,
      time: minutesToTime(Math.max(0, Math.min(start, latest))),
    };
  }
  if (el.hasAttribute("data-calendar-untimed")) return { date, time: null };
  return { date, time: undefined };
}

export function startCalendarDrag(
  e: React.PointerEvent,
  event: CalendarEvent,
  mode: CalendarDrag["mode"],
  commit: DragCommit,
) {
  if (e.button !== 0 || !isDraggable(event)) return;
  e.stopPropagation();

  const startX = e.clientX;
  const startY = e.clientY;
  const grid = (e.currentTarget as Element).closest("[data-calendar-grid]");
  const grabOffsetMinutes =
    grid && event.time !== null
      ? gridMinutes(grid, startY) - timeToMinutes(event.time)
      : 0;
  let active = false;

  const onMove = (move: PointerEvent) => {
    if (
      !active &&
      Math.hypot(move.clientX - startX, move.clientY - startY) <
        activationDistance
    ) {
      return;
    }
    active = true;
    move.preventDefault();

    const prev = useCalendarDrag.getState().drag;
    const base: CalendarDrag = prev ?? {
      event,
      mode,
      x: move.clientX,
      y: move.clientY,
      target: null,
      durationMinutes: blockMinutes(event),
    };

    if (mode === "resize") {
      const column = document.querySelector(
        `[data-calendar-grid][${dateAttr}="${event.date}"]`,
      );
      if (!column || event.time === null) return;
      const start = timeToMinutes(event.time);
      const end = Math.min(
        minutesInDay,
        snapToGrid(gridMinutes(column, move.clientY)),
      );
      useCalendarDrag.setState({
        drag: {
          ...base,
          x: move.clientX,
          y: move.clientY,
          target: { date: event.date, time: event.time },
          durationMinutes: Math.max(snapMinutes, end - start),
        },
      });
      return;
    }

    useCalendarDrag.setState({
      drag: {
        ...base,
        x: move.clientX,
        y: move.clientY,
        target: findTarget(base, move.clientX, move.clientY, grabOffsetMinutes),
      },
    });
  };

  const finish = (commitDrag: boolean) => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    window.removeEventListener("keydown", onKeyDown, { capture: true });
    const drag = useCalendarDrag.getState().drag;
    useCalendarDrag.setState({ drag: null });
    if (!active) return;

    // The pointerup of a drag must not also click the card underneath. The
    // click, if any, fires before the timeout.
    const swallowClick = (click: MouseEvent) => {
      click.stopPropagation();
      click.preventDefault();
    };
    window.addEventListener("click", swallowClick, { capture: true });
    setTimeout(() => {
      window.removeEventListener("click", swallowClick, { capture: true });
    }, 0);
    if (commitDrag && drag) commit(drag);
  };
  const onUp = () => finish(true);
  const onCancel = () => finish(false);
  const onKeyDown = (key: KeyboardEvent) => {
    if (key.key !== "Escape") return;
    key.preventDefault();
    key.stopPropagation();
    finish(false);
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onCancel);
  window.addEventListener("keydown", onKeyDown, { capture: true });
}
