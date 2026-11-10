import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FocusKey } from "@/store/focusSlice.ts";
import type { CalendarEvent } from "./calendarModel";
import {
  type CalendarDrag,
  type DragCommit,
  holdTouchScroll,
  longPressMs,
  startCalendarDrag,
  useCalendarDrag,
} from "./calendarDrag";

const event = (key: string): CalendarEvent => ({
  key,
  taskId: key,
  focusKey: key as FocusKey,
  date: "2026-10-28",
  title: key,
  nature: undefined,
  time: null,
  durationMinutes: null,
  isDone: false,
  isProjected: false,
  templateId: null,
});

const pointer = (type: string, clientX: number, clientY: number) =>
  Object.assign(new Event(type, { cancelable: true }), { clientX, clientY });

const pointerDown = (pointerType = "mouse") =>
  ({
    pointerType,
    button: 0,
    clientX: 0,
    clientY: 0,
    stopPropagation: () => {},
    currentTarget: { closest: () => null },
  }) as unknown as React.PointerEvent;

// A touchmove on the card, which keeps receiving its touch's events.
const touchMove = (card: EventTarget) => {
  const move = new Event("touchmove", { cancelable: true });
  card.dispatchEvent(move);
  return move.defaultPrevented;
};

// Drags a card by 20px and drops it.
function dragCard(card: CalendarEvent, commit: DragCommit) {
  startCalendarDrag(
    {
      button: 0,
      clientX: 0,
      clientY: 0,
      stopPropagation: () => {},
      currentTarget: { closest: () => null },
    } as unknown as React.PointerEvent,
    card,
    "move",
    commit,
  );
  window.dispatchEvent(pointer("pointermove", 20, 20));
  window.dispatchEvent(pointer("pointerup", 20, 20));
}

describe("calendar drag", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("document", { elementsFromPoint: () => [] });
  });
  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    useCalendarDrag.setState({ drag: null });
  });

  it("drags the grabbed card while an earlier drop is still saving", () => {
    const committed: string[] = [];
    // The first drop's write never lands, so its preview stays up.
    const commit = (drag: CalendarDrag) => {
      committed.push(drag.event.key);
      return new Promise<void>(() => {});
    };

    dragCard(event("a"), commit);
    dragCard(event("b"), commit);

    expect(committed).toEqual(["a", "b"]);
    expect(useCalendarDrag.getState().drag?.event.key).toBe("b");
  });

  it("starts a touch drag after a long press and holds the page still", () => {
    const card = new EventTarget();
    holdTouchScroll(card as HTMLElement);
    const commit = vi.fn();

    startCalendarDrag(pointerDown("touch"), event("a"), "move", commit);
    expect(touchMove(card)).toBe(false);
    vi.advanceTimersByTime(longPressMs);
    expect(touchMove(card)).toBe(true);
    window.dispatchEvent(pointer("pointermove", 20, 20));
    window.dispatchEvent(pointer("pointerup", 20, 20));

    expect(commit).toHaveBeenCalledOnce();
    expect(touchMove(card)).toBe(false);
  });

  it("leaves a touch that moves before the long press to scroll", () => {
    const card = new EventTarget();
    holdTouchScroll(card as HTMLElement);
    const commit = vi.fn();

    startCalendarDrag(pointerDown("touch"), event("a"), "move", commit);
    window.dispatchEvent(pointer("pointermove", 0, 20));
    vi.advanceTimersByTime(longPressMs);
    expect(touchMove(card)).toBe(false);
    window.dispatchEvent(pointer("pointerup", 0, 20));

    expect(commit).not.toHaveBeenCalled();
  });
});
