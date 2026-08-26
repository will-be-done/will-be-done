import { useEffect, useRef, useState, type ReactNode } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { format, isToday, isTomorrow, isYesterday, parse } from "date-fns";
import { Calendar as CalendarIcon, Flag } from "lucide-react";
import { PlannedDurationPicker } from "./PlannedDurationPicker.tsx";
import { useAsyncDispatch } from "@will-be-done/hyperdb/react";
import { useAsyncSelector } from "@will-be-done/hyperdb/react";
import {
  addToDailyList,
  allProjectsSorted,
  createDailyListIfNotPresent,
  createTaskInList,
  createTaskInSection,
  createTaskInStash,
  createProjectTask,
  getDMY,
  type TaskNature,
} from "@will-be-done/slices/space";
import { Calendar } from "@/components/ui/calendar.tsx";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import { cn } from "@/lib/utils.ts";
import { useFocusStore } from "@/store/focusSlice.ts";

export type AddTaskDestination =
  | { type: "dailyList" }
  | { type: "section"; projectSectionId: string }
  | { type: "stash" };

type AddTaskComposerProps = {
  children?: ReactNode;
  destination: AddTaskDestination;
  defaultProjectId: string;
  defaultDate?: Date | string;
  showDate?: boolean;
  showProject?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const dailyDateFormat = "yyyy-MM-dd";

const toDate = (value: Date | string | undefined): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  const parsed = parse(value, dailyDateFormat, new Date());
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const formatDateLabel = (date: Date | undefined) => {
  if (!date) return "No date";
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  if (isYesterday(date)) return "Yesterday";
  return format(
    date,
    date.getFullYear() === new Date().getFullYear() ? "MMM d" : "MMM d, yyyy",
  );
};

const natureLabel = (nature: TaskNature) => {
  if (nature === "red") return "Red";
  if (nature === "green") return "Green";
  return "Nature";
};

const isNestedPickerEvent = (event: Event) => {
  const target = event.target;
  return target instanceof Element && target.closest("[data-add-task-nested]");
};

export const AddTaskComposer = ({
  children,
  destination,
  defaultProjectId,
  defaultDate,
  showDate = true,
  showProject = true,
  open: openProp,
  onOpenChange,
}: AddTaskComposerProps) => {
  const dispatch = useAsyncDispatch();
  const { data: projects = [] } = useAsyncSelector({
    selector: allProjectsSorted,
    args: {},
  });

  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = openProp ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  const [title, setTitle] = useState("");
  const [date, setDate] = useState<Date | undefined>(() => toDate(defaultDate));
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [nature, setNature] = useState<TaskNature>("unknown");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState<number | undefined>();

  const titleRef = useRef<HTMLTextAreaElement | null>(null);
  const discardOnCloseRef = useRef(false);
  const isSubmittingRef = useRef(false);

  const selectedProject =
    projects.find((project) => project.id === projectId) ??
    projects.find((project) => project.id === defaultProjectId);

  const resetDraft = () => {
    setTitle("");
    setDate(toDate(defaultDate));
    setProjectId(defaultProjectId);
    setNature("unknown");
    setDurationMinutes(undefined);
    setDatePickerOpen(false);
    isSubmittingRef.current = false;
  };

  useEffect(() => {
    if (!open) return;

    resetDraft();
    useFocusStore.getState().disableFocus();

    return () => {
      useFocusStore.getState().enableFocus();
    };
    // Only reset when the composer opens, not when defaults change mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || isSubmittingRef.current) return;

    isSubmittingRef.current = true;

    const taskAttrs = {
      title: trimmedTitle,
      nature: nature ?? "unknown",
      ...(durationMinutes != null ? { durationMinutes } : {}),
    };

    try {
      if (destination.type === "section") {
        const task = await dispatch(
          createTaskInSection({
            projectSectionId: destination.projectSectionId,
            position: "prepend",
            taskAttrs,
          }),
        );

        if (date) {
          const dailyList = await dispatch(
            createDailyListIfNotPresent({ date: getDMY(date) }),
          );
          await dispatch(
            addToDailyList({
              taskId: task.id,
              dailyListId: dailyList.id,
              position: "prepend",
            }),
          );
        }
      } else if (destination.type === "stash" && !date) {
        await dispatch(
          createTaskInStash({
            projectId,
            position: "prepend",
            sectionPosition: "prepend",
            taskAttrs,
          }),
        );
      } else if (date) {
        const dailyList = await dispatch(
          createDailyListIfNotPresent({ date: getDMY(date) }),
        );
        await dispatch(
          createTaskInList({
            dailyListId: dailyList.id,
            projectId,
            listPosition: "prepend",
            sectionPosition: "prepend",
            taskAttrs,
          }),
        );
      } else {
        await dispatch(
          createProjectTask({
            projectId,
            position: "prepend",
            taskAttrs,
          }),
        );
      }

      discardOnCloseRef.current = true;
      setOpen(false);
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (next) {
      discardOnCloseRef.current = false;
      setOpen(true);
      return;
    }

    if (!discardOnCloseRef.current && title.trim()) {
      void submit();
      return;
    }

    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {children ? <DialogTrigger asChild>{children}</DialogTrigger> : null}
      <DialogContent
        className={cn(
          "w-[min(42rem,calc(100vw-2rem))] max-w-none gap-0 rounded-2xl border-0 bg-panel p-6 shadow-2xl sm:max-w-none",
          "[&>button.absolute]:hidden",
        )}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          titleRef.current?.focus();
        }}
        onEscapeKeyDown={() => {
          discardOnCloseRef.current = true;
        }}
        onPointerDownOutside={(event) => {
          if (isNestedPickerEvent(event)) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (isNestedPickerEvent(event)) event.preventDefault();
        }}
      >
        <DialogTitle className="sr-only">New task</DialogTitle>
        <TextareaAutosize
          ref={titleRef}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.stopPropagation();
              void submit();
            }
          }}
          placeholder="Task description..."
          aria-label="Task description"
          minRows={4}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          className="min-h-24 w-full resize-none bg-transparent text-lg text-content placeholder:text-content-tinted/50 focus:outline-none"
        />
        <div className="mt-4 flex items-center justify-end gap-1">
          {showDate && (
            <Popover
              open={datePickerOpen}
              onOpenChange={setDatePickerOpen}
              modal={false}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-content-tinted hover:bg-panel-hover hover:text-content cursor-pointer"
                >
                  <CalendarIcon className="size-4" />
                  <span>{formatDateLabel(date)}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent
                data-add-task-nested
                className="z-70 w-auto p-0"
                align="end"
              >
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(nextDate) => {
                    setDate(nextDate);
                    setDatePickerOpen(false);
                  }}
                  modifiers={{ today: new Date() }}
                />
                {date && (
                  <div className="border-t border-ring p-2">
                    <button
                      type="button"
                      className="w-full rounded-md px-2 py-1.5 text-sm text-content-tinted hover:bg-panel-hover hover:text-content cursor-pointer"
                      onClick={() => {
                        setDate(undefined);
                        setDatePickerOpen(false);
                      }}
                    >
                      No date
                    </button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          )}

          <PlannedDurationPicker
            nested
            value={durationMinutes}
            onChange={setDurationMinutes}
          />

          {showProject && (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex max-w-48 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-content-tinted hover:bg-panel-hover hover:text-content cursor-pointer"
                >
                  <span className="truncate">
                    {selectedProject
                      ? `${selectedProject.icon || "🟡"} ${selectedProject.title}`
                      : "Project"}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                data-add-task-nested
                align="end"
                className="z-70 min-w-48"
              >
                {projects.map((project) => (
                  <DropdownMenuItem
                    key={project.id}
                    onSelect={() => setProjectId(project.id)}
                  >
                    <span className="truncate">
                      {project.icon || "🟡"} {project.title}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-panel-hover",
                  nature === "red"
                    ? "text-nature-red-content"
                    : nature === "green"
                      ? "text-nature-green-content"
                      : "text-content-tinted hover:text-content",
                )}
                aria-label="Task nature"
              >
                <Flag className="size-4" />
                {nature !== "unknown" && <span>{natureLabel(nature)}</span>}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              data-add-task-nested
              align="end"
              className="z-70 min-w-32"
            >
              <DropdownMenuItem onSelect={() => setNature("red")}>
                <Flag className="size-3.5 text-nature-red-content" />
                Red
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setNature("green")}>
                <Flag className="size-3.5 text-nature-green-content" />
                Green
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setNature("unknown")}>
                <Flag className="size-3.5 text-content-tinted" />
                None
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </DialogContent>
    </Dialog>
  );
};
