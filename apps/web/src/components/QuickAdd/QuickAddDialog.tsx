import { useEffect, useRef, useState } from "react";
import { useMatch, useParams, useSearch } from "@tanstack/react-router";
import { format, isToday, isTomorrow, parse } from "date-fns";
import { Command } from "cmdk";
import {
  CalendarDays,
  Check,
  ChevronDown,
  Folder,
  Hash,
  Search,
  X,
} from "lucide-react";
import {
  useAsyncDispatch,
  useAsyncSelector,
} from "@will-be-done/hyperdb/react";
import {
  allProjectsSorted,
  createProjectTask,
  getDMY,
  projectSectionsByProjectId,
  scheduleTask,
} from "@will-be-done/slices/space";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  type TaskCreationLocation,
  captureWebAnalytics,
} from "@/lib/analytics";
import { closeQuickAdd, openQuickAdd, useQuickAdd } from "./quickAddStore";
import { cn } from "@/lib/utils";
import { useFocusStore } from "@/store/focusSlice";
import { TimeInput } from "@/components/Task/TaskTimeInputs";
import { ProjectIcon } from "@/components/ui/emoji";

const chipClass =
  "flex h-7 min-w-0 cursor-pointer items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2 text-xs text-content-tinted transition-colors hover:bg-white/[0.05] hover:text-content focus:outline-none focus-visible:border-accent/60";

const popoverClass =
  "z-[10001] border border-white/10 bg-task-dropdown p-0 backdrop-blur-none";

// Unlike isInputElement, focused cards and buttons still get the shortcut;
// only Ctrl+A's select-all while typing must win.
const isEditingText = (target: EventTarget | null) =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  (target instanceof HTMLElement && target.isContentEditable);

// The project and date of the page the dialog opens from.
function usePageDefaults() {
  const params = useParams({ strict: false });
  const search = useSearch({ strict: false });
  // The timeline's date is the start of a week, not a day.
  const isTimeline = useMatch({
    from: "/spaces/$spaceId/timeline/$date",
    shouldThrow: false,
  });

  return {
    projectId: params.projectId ?? search.projectId ?? "inbox",
    date:
      params.date && !isTimeline
        ? parse(params.date, "yyyy-MM-dd", new Date())
        : undefined,
  };
}

export function QuickAddDialog() {
  const request = useQuickAdd((s) => s.request);
  const defaults = usePageDefaults();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.code !== "KeyA" ||
        !event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey ||
        event.repeat ||
        event.defaultPrevented ||
        document.querySelector('[role="dialog"]')
      ) {
        return;
      }

      if (isEditingText(event.target)) return;

      event.preventDefault();
      openQuickAdd();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) closeQuickAdd();
      }}
    >
      {request && (
        <QuickAddForm
          defaultProjectId={defaults.projectId}
          defaultDate={request.date ?? defaults.date}
          defaultTime={request.time ?? null}
          location={request.location}
          onDone={closeQuickAdd}
        />
      )}
    </Dialog>
  );
}

function QuickAddForm({
  defaultProjectId,
  defaultDate,
  defaultTime,
  location,
  onDone,
}: {
  defaultProjectId: string;
  defaultDate: Date | undefined;
  defaultTime: string | null;
  location: TaskCreationLocation | undefined;
  onDone: () => void;
}) {
  const dispatch = useAsyncDispatch();
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState(defaultTime);
  const [isDateOpen, setIsDateOpen] = useState(false);

  const { data: projects = [] } = useAsyncSelector({
    selector: allProjectsSorted,
    args: {},
  });
  // "inbox" is the routes' alias for the inbox project.
  const project =
    projects.find((p) => p.id === projectId) ?? projects.find((p) => p.isInbox);
  const { data: sections = [] } = useAsyncSelector({
    selector: projectSectionsByProjectId,
    args: { projectId: project?.id ?? "" },
  });
  const section = sections.find((s) => s.id === sectionId) ?? sections[0];

  useEffect(() => {
    useFocusStore.getState().disableFocus();
    return () => useFocusStore.getState().enableFocus();
  }, []);

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed || !project || !section) return;

    onDone();
    void (async () => {
      await dispatch(
        (function* () {
          const task = yield* createProjectTask({
            projectId: project.id,
            position: "prepend",
            taskAttrs: { title: trimmed, projectSectionId: section.id },
          });
          if (date) {
            yield* scheduleTask({
              taskId: task.id,
              date: getDMY(date),
              position: "append",
              ...(time ? { time } : {}),
            });
          }
        })(),
      );
      captureWebAnalytics({
        name: "task_created",
        properties: {
          creation_method: "quick_add",
          location: location ?? (date ? "daily_list" : "project"),
        },
      });
    })();
  };

  return (
    <DialogContent
      className="z-[10000] gap-3 rounded-xl border-dialog-border bg-dialog-bg p-4 shadow-[0_32px_90px_rgba(0,0,0,0.8)] sm:max-w-lg [&>button]:text-content-tinted"
      overlayClassName="z-[10000] bg-black/60 backdrop-blur-sm"
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        titleRef.current?.focus();
      }}
    >
      <DialogTitle className="text-[15px] font-semibold text-content">
        Quick add
      </DialogTitle>
      <DialogDescription className="sr-only">
        Type a task title, pick where it goes, and press Enter.
      </DialogDescription>

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          ref={titleRef}
          aria-label="Task title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs to be done?"
          className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-content outline-none transition-shadow placeholder:text-content-tinted/50 focus:border-accent/60 focus:ring-2 focus:ring-accent/40"
          autoComplete="off"
        />

        <div className="flex flex-wrap items-center gap-2">
          <SelectChip
            label="Project"
            icon={<Folder className="h-3 w-3 shrink-0" />}
            value={project?.id}
            options={projects.map((p) => ({
              value: p.id,
              label: p.title,
              prefix: <ProjectIcon icon={p.icon} />,
            }))}
            onChange={(id) => {
              setProjectId(id);
              setSectionId(null);
            }}
            returnFocusRef={titleRef}
          />

          {sections.length > 1 && (
            <SelectChip
              label="Section"
              icon={<Hash className="h-3 w-3 shrink-0" />}
              value={section?.id}
              options={sections.map((s) => ({
                value: s.id,
                label: s.title || "Untitled",
              }))}
              onChange={setSectionId}
              returnFocusRef={titleRef}
            />
          )}

          <Popover open={isDateOpen} onOpenChange={setIsDateOpen}>
            <PopoverTrigger asChild>
              <button type="button" className={chipClass}>
                <CalendarDays className="h-3 w-3 shrink-0" />
                <span className={date ? "text-content" : undefined}>
                  {date ? dateLabel(date) : "No date"}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent
              className={cn(popoverClass, "w-auto")}
              align="start"
              onCloseAutoFocus={(e) => {
                e.preventDefault();
                titleRef.current?.focus();
              }}
            >
              <Calendar
                mode="single"
                selected={date}
                defaultMonth={date}
                onSelect={(next) => {
                  setDate(next);
                  if (!next) setTime(null);
                  setIsDateOpen(false);
                }}
                modifiers={{ today: new Date() }}
              />
            </PopoverContent>
          </Popover>
          {date && (
            <button
              type="button"
              aria-label="Clear date"
              onClick={() => {
                setDate(undefined);
                setTime(null);
                titleRef.current?.focus();
              }}
              className="-ml-1.5 cursor-pointer rounded p-1 text-content-tinted transition-colors hover:bg-white/[0.05] hover:text-content"
            >
              <X className="h-3 w-3" />
            </button>
          )}

          {/* Time lives on the DailyEntry, so it needs a date first. */}
          {date && (
            <span className={cn(chipClass, "cursor-default")}>
              <TimeInput time={time} onChange={setTime} />
            </span>
          )}

          <button
            type="submit"
            disabled={!title.trim()}
            className="ml-auto cursor-pointer rounded-md bg-accent px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-accent/85 disabled:cursor-default disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </form>
    </DialogContent>
  );
}

function SelectChip({
  label,
  icon,
  value,
  options,
  onChange,
  returnFocusRef,
}: {
  label: string;
  icon: React.ReactNode;
  value: string | undefined;
  options: { value: string; label: string; prefix?: React.ReactNode }[];
  onChange: (value: string) => void;
  returnFocusRef: React.RefObject<HTMLElement | null>;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={label} className={chipClass}>
          {icon}
          <span className="max-w-44 truncate text-content">
            {current?.prefix} {current?.label}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn(popoverClass, "w-64")}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          returnFocusRef.current?.focus();
        }}
      >
        <Command defaultValue={value} loop>
          <div className="flex items-center gap-2 border-b border-white/10 px-2.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-content-tinted" />
            <Command.Input
              placeholder={`Search ${label.toLowerCase()}s...`}
              className="h-9 w-full bg-transparent text-sm text-content outline-none placeholder:text-content-tinted/60"
            />
          </div>
          <Command.List className="max-h-64 overflow-y-auto p-1.5">
            <Command.Empty className="px-2 py-1.5 text-xs text-content-tinted">
              Nothing found
            </Command.Empty>
            {options.map((option) => (
              <Command.Item
                key={option.value}
                value={option.value}
                keywords={[option.label]}
                onSelect={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-calendar-day transition-colors data-[selected=true]:bg-panel-tinted data-[selected=true]:text-content"
              >
                <span className="min-w-0 flex-1 truncate">
                  {option.prefix} {option.label}
                </span>
                {option.value === value && (
                  <Check className="h-3.5 w-3.5 shrink-0 text-accent" />
                )}
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const dateLabel = (date: Date) =>
  isToday(date)
    ? "Today"
    : isTomorrow(date)
      ? "Tomorrow"
      : format(date, "EEE, MMM d");
