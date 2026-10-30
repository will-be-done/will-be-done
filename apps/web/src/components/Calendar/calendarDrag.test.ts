import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarEvent } from "./calendarModel";
import {
  type CalendarDrag,
  type DragCommit,
  startCalendarDrag,
  useCalendarDrag,
} from "./calendarDrag";

const event = (key: string): CalendarEvent => ({
  key,
  taskId: key,
  focusKey: key,
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
});
