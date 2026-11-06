import { useEffect } from "react";
import { addDays, parse } from "date-fns";
import { useAsyncDispatch } from "@will-be-done/hyperdb/react";
import {
  deleteListItems,
  getDMY,
  type ListItemType,
  scheduleListItems,
  scheduleTask,
  setDailyEntryTime,
  setListItemsNature,
  stashListItems,
  type TaskNature,
  toggleTaskState,
  trashListItemTasks,
  updateTemplate,
} from "@will-be-done/slices/space";
import {
  type FocusKey,
  parseColumnKey,
  useFocusStore,
} from "@/store/focusSlice.ts";
import { isInputElement } from "@/utils/isInputElement.ts";
import {
  useItemDetailsEditRequest,
  useItemDetailsOpen,
} from "@/components/ItemDetails/ItemDetailsStore.ts";
import {
  type CalendarDirection,
  type CalendarEvent,
  type CalendarView,
  adjacentTime,
  calendarNeighbor,
  isDraggable,
  minutesInDay,
  minutesToTime,
  shownDayEvents,
  snapMinutes,
  timeToMinutes,
} from "./calendarModel";
import type { DayActions } from "./DayCells";

const directionKeys: Record<string, CalendarDirection | undefined> = {
  ArrowLeft: "left",
  KeyH: "left",
  ArrowRight: "right",
  KeyL: "right",
  ArrowUp: "up",
  KeyK: "up",
  ArrowDown: "down",
  KeyJ: "down",
};

const natureKeys: Record<string, NonNullable<TaskNature> | undefined> = {
  Digit1: "red",
  Digit2: "green",
  Digit3: "unknown",
};

// Removing a daily entry unschedules its task, which is what r does in lists.
const removeKeys = new Set(["Backspace", "Delete", "KeyD", "KeyX", "KeyR"]);

const shiftDate = (date: string, days: number) =>
  getDMY(addDays(parse(date, "yyyy-MM-dd", new Date()), days));

// Runs after the card renders in its day. A full month cell hides it behind
// "+N more", where it can't take focus. Plain focus() scrolls only when the
// card is off-screen, so a card under the pointer stays put.
export const focusCardOnceShown = (key: FocusKey, onHidden: () => void) =>
  setTimeout(() => {
    const card = document.querySelector<HTMLElement>(
      `[data-focusable-key="${key}"]`,
    );
    if (card) card.focus();
    else onHidden();
  }, 0);

// Keys for the focused calendar card, like the ones a focused task has in a
// list. Real events are daily entries; projected ones are template
// occurrences, which only take nature changes and template retiming.
export function useCalendarKeys({
  view,
  days,
  eventsByDate,
  onCreate,
}: {
  view: CalendarView;
  days: Date[];
  eventsByDate: Map<string, CalendarEvent[]>;
  onCreate: DayActions["onCreate"];
}) {
  const dispatch = useAsyncDispatch();

  // On the window, so the keys still work after a dialog drops DOM focus.
  // Capturing runs before the list navigation in GlobalListener.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const focus = useFocusStore.getState();
      if (focus.isFocusDisabled || focus.editItemKey || e.defaultPrevented) {
        return;
      }
      if (e.target instanceof Element && isInputElement(e.target)) return;
      if (e.altKey) return;

      const dates = days.map((day) => getDMY(day));
      const shown = dates.map((date) =>
        shownDayEvents(view, eventsByDate.get(date) ?? []),
      );
      const event = shown
        .flat()
        .find((candidate) => candidate.focusKey === focus.focusItemKey);
      if (!event) return;

      const { id, type } = parseColumnKey(event.focusKey);
      const listItems = [{ id, modelType: type as ListItemType }];
      const neighbor = (direction: CalendarDirection) =>
        calendarNeighbor(view, shown, event.focusKey, direction);

      const focusPast = () => {
        const next = neighbor("down") ?? neighbor("up");
        if (next) focus.focusByKey(next.focusKey);
        else focus.resetFocus();
      };

      const retime = (step: number) => {
        if (event.time === null || !isDraggable(event)) return;
        const time = minutesToTime(
          Math.min(
            Math.max(timeToMinutes(event.time) + step, 0),
            minutesInDay - snapMinutes,
          ),
        );
        if (event.templateId !== null) {
          void dispatch(
            updateTemplate({ id: event.templateId, template: { time } }),
          );
        } else {
          void dispatch(setDailyEntryTime({ taskId: event.taskId, time }));
        }
      };

      const reschedule = (step: number) => {
        const date = shiftDate(event.date, step);
        // An off-screen day would take the focused card out of view.
        if (event.isProjected || !dates.includes(date)) return;
        void dispatch(
          scheduleTask({ taskId: event.taskId, date, position: "append" }),
        ).then(() => focusCardOnceShown(event.focusKey, focus.resetFocus));
      };

      const run = (command: () => void) => {
        e.preventDefault();
        e.stopPropagation();
        command();
      };

      // A focused button, like "+N more", keeps its own activation keys.
      if (
        (e.code === "Enter" || e.code === "Space") &&
        e.target instanceof Element &&
        e.target.closest("button")
      ) {
        return;
      }

      const direction = directionKeys[e.code];
      if (e.ctrlKey || e.metaKey) {
        if (e.code === "Backspace" && !e.shiftKey && !event.isProjected) {
          return run(() => {
            focusPast();
            void dispatch(trashListItemTasks({ listItems }));
          });
        }
        if (!direction || !e.ctrlKey || e.metaKey || e.shiftKey) return;
        const isTimeGrid = view === "day" || view === "week";
        const sign = direction === "left" || direction === "up" ? -1 : 1;
        return run(() => {
          if (direction === "left" || direction === "right") reschedule(sign);
          else if (isTimeGrid) retime(sign * snapMinutes);
          else reschedule(sign * 7);
        });
      }

      if (e.shiftKey) {
        if (e.code === "KeyS" && !event.isProjected) {
          run(() => {
            focusPast();
            void dispatch(stashListItems({ listItems }));
          });
        } else if (e.code === "KeyO") {
          run(() => onCreate(event.date, adjacentTime(event, "before")));
        }
        return;
      }

      if (direction) {
        return run(() => {
          const next = neighbor(direction);
          if (next) focus.focusByKey(next.focusKey);
        });
      }

      const nature = natureKeys[e.code];
      if (nature) {
        return run(
          () => void dispatch(setListItemsNature({ listItems, nature })),
        );
      }

      if (e.code === "Enter") {
        return run(() => useItemDetailsOpen.getState().setOpen(true));
      }
      if (e.code === "KeyE") {
        return run(() => {
          useItemDetailsOpen.getState().setOpen(true);
          useItemDetailsEditRequest
            .getState()
            .editDescription(event.isProjected ? id : event.taskId);
        });
      }
      if (e.code === "KeyO") {
        return run(() => onCreate(event.date, adjacentTime(event, "after")));
      }
      if (e.code === "Escape") {
        return run(() => {
          focus.resetFocus();
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
        });
      }

      if (event.isProjected) return;

      if (e.code === "Space") {
        return run(
          () => void dispatch(toggleTaskState({ taskId: event.taskId })),
        );
      }
      if (removeKeys.has(e.code)) {
        return run(() => {
          focusPast();
          void dispatch(deleteListItems({ listItems }));
        });
      }
      if (e.code === "KeyT") {
        return run(() => {
          const today = getDMY(new Date());
          const isTodayShown = dates.includes(today);
          if (!isTodayShown) focusPast();
          void dispatch(scheduleListItems({ listItems, date: today })).then(
            () => {
              if (isTodayShown) {
                focusCardOnceShown(event.focusKey, focus.resetFocus);
              }
            },
          );
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [view, days, eventsByDate, onCreate, dispatch]);
}
