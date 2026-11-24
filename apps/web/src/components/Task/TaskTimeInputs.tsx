import { useLayoutEffect, useRef, useState } from "react";
import { Clock, Hourglass } from "lucide-react";
import { format } from "date-fns";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  durationPresets,
  formatDuration,
  formatTaskTime,
  parseDuration,
  parseTaskTime,
} from "@/lib/taskTime";

const pad = (n: number) => String(n).padStart(2, "0");

const hours = Array.from({ length: 24 }, (_, i) => i);
const minuteSteps = Array.from({ length: 12 }, (_, i) => i * 5);

const optionClassName =
  "rounded-md text-calendar-day tabular-nums cursor-pointer transition-colors hover:bg-panel-tinted hover:text-content data-[selected=true]:bg-accent/20 data-[selected=true]:text-content data-[selected=true]:ring-1 data-[selected=true]:ring-inset data-[selected=true]:ring-accent";

const footerButtonClassName =
  "rounded-md px-3 py-1.5 text-xs cursor-pointer transition-colors text-content-tinted hover:bg-panel-tinted hover:text-content disabled:pointer-events-none disabled:opacity-40";

// A text field that accepts typed values, with a button that opens a picker,
// or, with `pickOnClick`, a click on the field itself, or Enter on an
// untouched field. Typed text commits on Enter or blur; Escape or unparseable
// text reverts.
function PickerField({
  display,
  placeholder,
  ariaLabel,
  icon,
  onCommitText,
  open,
  onOpenChange,
  pickOnClick = false,
  className,
  children,
}: {
  display: string;
  placeholder: string;
  ariaLabel: string;
  icon: React.ReactNode;
  onCommitText: (text: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pickOnClick?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const fieldRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // A click keeps focus in the field for typing; the keyboard moves it into
  // the picker and back.
  const openedByKeyboard = useRef(false);
  const openPicker = (byKeyboard: boolean) => {
    openedByKeyboard.current = byKeyboard;
    onOpenChange(true);
  };

  const field = (
    <span
      ref={fieldRef}
      className={cn(
        "inline-flex items-center gap-0.5 rounded px-1 -mx-1 text-xs transition-colors hover:bg-task-panel-hover focus-within:bg-task-panel-hover",
        className,
      )}
    >
      <input
        ref={inputRef}
        type="text"
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={draft ?? display}
        onChange={(e) => setDraft(e.target.value)}
        onClick={
          pickOnClick
            ? () => (open ? onOpenChange(false) : openPicker(false))
            : undefined
        }
        onKeyDown={(e) => {
          if (e.key === "Enter" && pickOnClick && draft === null && !open) {
            e.preventDefault();
            openPicker(true);
          } else if (e.key === "Enter") {
            e.preventDefault();
            onOpenChange(false);
            e.currentTarget.blur();
          } else if (e.key === "Escape" && draft !== null) {
            e.stopPropagation();
            cancelRef.current = true;
            e.currentTarget.blur();
          } else if (e.key === "ArrowDown" && e.altKey) {
            e.preventDefault();
            openPicker(true);
          }
        }}
        onBlur={(e) => {
          const text = e.target.value;
          setDraft(null);
          if (cancelRef.current) {
            cancelRef.current = false;
          } else if (draft !== null) {
            onCommitText(text);
          }
        }}
        className={cn(
          "bg-transparent [font-size:inherit] text-content placeholder:text-content-tinted focus:outline-none",
          pickOnClick ? "w-full min-w-0 cursor-pointer" : "w-[4.5rem]",
        )}
      />
      {!pickOnClick && (
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Pick ${ariaLabel.toLowerCase()}`}
            className="cursor-pointer rounded p-0.5 text-content-tinted transition-colors hover:text-content"
          >
            {icon}
          </button>
        </PopoverTrigger>
      )}
    </span>
  );

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {pickOnClick ? <PopoverAnchor asChild>{field}</PopoverAnchor> : field}
      <PopoverContent
        align={pickOnClick ? "start" : "end"}
        onOpenAutoFocus={(event) => {
          if (pickOnClick && !openedByKeyboard.current) event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          if (pickOnClick && openedByKeyboard.current) {
            event.preventDefault();
            inputRef.current?.focus({ preventScroll: true });
          }
        }}
        onInteractOutside={(event) => {
          if (
            pickOnClick &&
            event.target instanceof Node &&
            fieldRef.current?.contains(event.target)
          ) {
            event.preventDefault();
            return;
          }
          // Focus goes where the user clicked or tabbed, not back to the field.
          openedByKeyboard.current = false;
        }}
        data-disable-task-shortcuts
        onDoubleClick={(event) => event.stopPropagation()}
        className="z-[10001] w-auto bg-task-dropdown p-0 backdrop-blur-none"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

function PickerColumn({
  label,
  values,
  selected,
  onSelect,
}: {
  label: string;
  values: number[];
  selected: number | null;
  onSelect: (value: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const container = scrollRef.current;
    const option = container?.querySelector<HTMLElement>(
      "[data-selected=true]",
    );
    if (!container || !option) return;
    container.scrollTop =
      option.offsetTop - container.clientHeight / 2 + option.clientHeight / 2;
    // Only center the initial selection; later picks shouldn't jump.
  }, []);

  return (
    <div className="flex w-20 flex-col">
      <div className="py-2 text-center text-xs text-content-secondary">
        {label}
      </div>
      <div
        ref={scrollRef}
        className="relative flex h-48 flex-col gap-0.5 overflow-y-auto px-1.5 pb-1.5 [scrollbar-width:none]"
      >
        {values.map((value) => (
          <button
            key={value}
            type="button"
            data-selected={value === selected}
            onClick={() => onSelect(value)}
            className={cn(optionClassName, "shrink-0 py-1.5 text-sm")}
          >
            {pad(value)}
          </button>
        ))}
      </div>
    </div>
  );
}

function TimePickerPanel({
  time,
  onPick,
}: {
  time: string | null;
  onPick: (time: string | null) => void;
}) {
  // Picks belong to the time they started from, so a typed time committing
  // while the picker is open replaces them.
  const [picked, setPicked] = useState<{
    from: string | null;
    hour: number;
    minute: number;
  }>();
  const { hour, minute } =
    picked?.from === time
      ? picked
      : {
          hour: time ? Number(time.slice(0, 2)) : null,
          minute: time ? Number(time.slice(3)) : null,
        };
  const minutes =
    minute === null || minuteSteps.includes(minute)
      ? minuteSteps
      : [...minuteSteps, minute].sort((a, b) => a - b);

  return (
    <div className="flex flex-col">
      <div className="flex divide-x divide-white/10">
        <PickerColumn
          label="Hour"
          values={hours}
          selected={hour}
          onSelect={(value) =>
            setPicked({ from: time, hour: value, minute: minute ?? 0 })
          }
        />
        <PickerColumn
          label="Minute"
          values={minutes}
          selected={minute}
          onSelect={(value) =>
            setPicked({
              from: time,
              hour: hour ?? new Date().getHours(),
              minute: value,
            })
          }
        />
      </div>
      <div className="flex items-center justify-between gap-1 border-t border-white/10 p-1.5">
        <button
          type="button"
          className={footerButtonClassName}
          onClick={() => onPick(format(new Date(), "HH:mm"))}
        >
          Now
        </button>
        <button
          type="button"
          className={footerButtonClassName}
          disabled={time === null}
          onClick={() => onPick(null)}
        >
          Clear
        </button>
        <button
          type="button"
          className={cn(
            footerButtonClassName,
            "bg-accent/20 text-content hover:bg-accent/30",
          )}
          disabled={hour === null}
          onClick={() => {
            if (hour !== null) onPick(`${pad(hour)}:${pad(minute ?? 0)}`);
          }}
        >
          OK
        </button>
      </div>
    </div>
  );
}

export function TimeInput({
  time,
  onChange,
  pickOnClick,
  className,
}: {
  time: string | null;
  onChange: (time: string | null) => void;
  pickOnClick?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const commit = (next: string | null) => {
    if (next !== time) onChange(next);
  };

  return (
    <PickerField
      display={time ? formatTaskTime(time) : ""}
      placeholder="--:--"
      ariaLabel="Time"
      icon={<Clock className="h-3 w-3" />}
      onCommitText={(text) => {
        if (text.trim() === "") return commit(null);
        const parsed = parseTaskTime(text);
        if (parsed !== null) commit(parsed);
      }}
      open={open}
      onOpenChange={setOpen}
      pickOnClick={pickOnClick}
      className={className}
    >
      <TimePickerPanel
        time={time}
        onPick={(next) => {
          commit(next);
          setOpen(false);
        }}
      />
    </PickerField>
  );
}

export function DurationInput({
  durationMinutes,
  onChange,
  pickOnClick,
  className,
}: {
  durationMinutes: number | null;
  onChange: (durationMinutes: number | null) => void;
  pickOnClick?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const commit = (next: number | null) => {
    if (next !== durationMinutes) onChange(next);
  };
  const pick = (next: number | null) => {
    commit(next);
    setOpen(false);
  };

  return (
    <PickerField
      display={durationMinutes ? formatDuration(durationMinutes) : ""}
      placeholder="None"
      ariaLabel="Duration"
      icon={<Hourglass className="h-3 w-3" />}
      onCommitText={(text) => {
        if (text.trim() === "") return commit(null);
        const parsed = parseDuration(text);
        if (parsed !== null) commit(parsed);
      }}
      open={open}
      onOpenChange={setOpen}
      pickOnClick={pickOnClick}
      className={className}
    >
      <div className="flex w-52 flex-col">
        <div className="grid grid-cols-3 gap-1 p-1.5">
          {durationPresets.map((minutes) => (
            <button
              key={minutes}
              type="button"
              data-selected={minutes === durationMinutes}
              onClick={() => pick(minutes)}
              className={cn(optionClassName, "py-1.5 text-sm")}
            >
              {formatDuration(minutes)}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-1 border-t border-white/10 p-1.5">
          <span className="px-1.5 text-xs text-content-secondary">
            Or type, e.g. 1h 20m
          </span>
          <button
            type="button"
            className={footerButtonClassName}
            disabled={durationMinutes === null}
            onClick={() => pick(null)}
          >
            Clear
          </button>
        </div>
      </div>
    </PickerField>
  );
}
