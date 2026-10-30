import { useEffect, useRef } from "react";
import { richTextMarkdownToPlainText } from "@will-be-done/slices/common";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { useSelectAsync } from "@will-be-done/hyperdb/react";
import { type Task, taskById } from "@will-be-done/slices/space";
import { isModelDNDData } from "@/lib/dnd/models";
import { type CalendarEvent, blockMinutes } from "./calendarModel";
import {
  type CalendarDrag,
  type DragCommit,
  findTarget,
  useCalendarDrag,
} from "./calendarDrag";

// Task, DailyEntry and StashEntry drags all carry the dragged task.
const draggedTaskId = (data: unknown) =>
  isModelDNDData(data) && "task" in data ? data.task.id : null;

const toEvent = (taskId: string, task: Task | undefined): CalendarEvent => ({
  key: `external-${taskId}`,
  taskId,
  focusKey: "",
  // Never equal to a calendar date, so any drop schedules the task.
  date: "",
  title: richTextMarkdownToPlainText(task?.title ?? "", "title"),
  nature: task?.nature,
  time: null,
  durationMinutes: task?.durationMinutes ?? null,
  isDone: task?.state === "done",
  isProjected: false,
  templateId: null,
});

// Lets tasks dragged from elsewhere in the app (the projects view) be dropped
// anywhere inside the element; the cell under the pointer decides the
// date and time, exactly like a drag started on the calendar.
export function useExternalTaskDrop(
  ref: React.RefObject<HTMLElement | null>,
  commit: DragCommit,
) {
  const select = useSelectAsync();
  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  }, [commit]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Title and duration load once per drag; the preview fills in when ready.
    const tasks = new Map<string, Task | undefined>();
    const load = (taskId: string) => {
      if (tasks.has(taskId)) return;
      tasks.set(taskId, undefined);
      void select({ selector: taskById, args: { id: taskId } }).then((task) =>
        tasks.set(taskId, task),
      );
    };

    const dragAt = (
      taskId: string,
      input: { clientX: number; clientY: number },
    ): CalendarDrag => {
      const event = toEvent(taskId, tasks.get(taskId));
      const drag: CalendarDrag = {
        event,
        mode: "move",
        x: input.clientX,
        y: input.clientY,
        target: null,
        durationMinutes: blockMinutes(event),
        isNative: true,
      };
      drag.target = findTarget(drag, input.clientX, input.clientY, 0);
      return drag;
    };

    const clear = () => useCalendarDrag.setState({ drag: null });

    return dropTargetForElements({
      element,
      canDrop: ({ source }) => draggedTaskId(source.data) !== null,
      onDragStart: ({ source }) => load(draggedTaskId(source.data)!),
      onDragEnter: ({ source }) => load(draggedTaskId(source.data)!),
      onDrag: ({ source, location }) => {
        useCalendarDrag.setState({
          drag: dragAt(draggedTaskId(source.data)!, location.current.input),
        });
      },
      onDragLeave: clear,
      onDrop: ({ source, location }) => {
        const drag = dragAt(
          draggedTaskId(source.data)!,
          location.current.input,
        );
        clear();
        commitRef.current(drag);
      },
    });
  }, [ref, select]);
}
