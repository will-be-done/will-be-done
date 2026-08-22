import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import { cn } from "@/lib/utils.ts";

export function formatClockMinutes(minutes: number): string {
  const clamped = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(clamped / 60);
  const remainder = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function parseUnit(raw: string, max: number) {
  if (raw === "") return 0;
  const next = Number.parseInt(raw, 10);
  if (!Number.isFinite(next)) return 0;
  return Math.min(max, Math.max(0, next));
}

export function TimePicker({
  value,
  onChange,
  onClear,
  children,
  align = "start",
  inline = false,
  nested = false,
  title = "Select time",
}: {
  value: number | null | undefined;
  onChange: (minutes: number) => void;
  onClear?: () => void;
  children: ReactNode;
  align?: "start" | "center" | "end";
  inline?: boolean;
  nested?: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hourText, setHourText] = useState("09");
  const [minuteText, setMinuteText] = useState("00");
  const [focused, setFocused] = useState<"hours" | "minutes" | null>(null);
  const hourRef = useRef<HTMLInputElement>(null);
  const minuteRef = useRef<HTMLInputElement>(null);
  const hourTextRef = useRef(hourText);
  const minuteTextRef = useRef(minuteText);
  const committed = value ?? 9 * 60;

  useEffect(() => {
    if (!open) {
      setFocused(null);
      return;
    }
    const next = ((Math.round(committed) % 1440) + 1440) % 1440;
    const hours = pad(Math.floor(next / 60));
    const minutes = pad(next % 60);
    hourTextRef.current = hours;
    minuteTextRef.current = minutes;
    setHourText(hours);
    setMinuteText(minutes);
    const id = window.setTimeout(() => hourRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open, committed]);

  const apply = () => {
    onChange(
      parseUnit(hourTextRef.current, 23) * 60 +
        parseUnit(minuteTextRef.current, 59),
    );
    setOpen(false);
  };

  const panel = (
    <form
      className="w-[220px]"
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
    >
      <div className="border-b border-border px-4 py-3 text-sm font-semibold text-content">
        {title}
      </div>
      <div className="flex items-center justify-center gap-1.5 px-4 py-5">
        <UnitInput
          ref={hourRef}
          value={hourText}
          max={23}
          focused={focused === "hours"}
          ariaLabel="Hours"
          onFocus={() => setFocused("hours")}
          onChange={(next) => {
            hourTextRef.current = next;
            setHourText(next);
          }}
          onComplete={() => minuteRef.current?.focus()}
          onEnter={apply}
        />
        <span className="text-lg font-medium text-content">:</span>
        <UnitInput
          ref={minuteRef}
          value={minuteText}
          max={59}
          focused={focused === "minutes"}
          ariaLabel="Minutes"
          onFocus={() => setFocused("minutes")}
          onChange={(next) => {
            minuteTextRef.current = next;
            setMinuteText(next);
          }}
          onEnter={apply}
        />
      </div>
      {onClear != null && (
        <div className="flex justify-center px-4 pb-3">
          <button
            type="button"
            onClick={() => {
              onClear();
              setOpen(false);
            }}
            className="cursor-pointer text-sm font-medium text-content-tinted hover:text-content"
          >
            No time
          </button>
        </div>
      )}
      <div className="flex items-center justify-between border-t border-border px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="cursor-pointer px-2 py-1 text-sm font-medium text-accent"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="cursor-pointer rounded-full bg-accent px-5 py-1.5 text-sm font-medium text-white"
        >
          Apply
        </button>
      </div>
    </form>
  );

  const contentClassName =
    "z-[1100] w-auto overflow-hidden rounded-2xl border-0 bg-dialog-bg p-0 text-content shadow-lg ring-1 ring-dialog-border";

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      {inline ? (
        <PopoverPrimitive.Content
          data-add-task-nested={nested ? true : undefined}
          align={align}
          sideOffset={4}
          className={cn(
            contentClassName,
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        >
          {panel}
        </PopoverPrimitive.Content>
      ) : (
        <PopoverContent
          data-add-task-nested={nested ? true : undefined}
          align={align}
          sideOffset={4}
          className={contentClassName}
        >
          {panel}
        </PopoverContent>
      )}
    </Popover>
  );
}

function UnitInput({
  value,
  max,
  focused,
  ariaLabel,
  onFocus,
  onChange,
  onComplete,
  onEnter,
  ref,
}: {
  value: string;
  max: number;
  focused: boolean;
  ariaLabel: string;
  onFocus: () => void;
  onChange: (value: string) => void;
  onComplete?: () => void;
  onEnter?: () => void;
  ref?: Ref<HTMLInputElement>;
}) {
  const typedRef = useRef("");

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      onEnter?.();
      return;
    }
    if (event.key === "Backspace") {
      event.preventDefault();
      typedRef.current = typedRef.current.slice(0, -1);
      onChange(typedRef.current);
      return;
    }
    if (!/^\d$/.test(event.key)) return;

    event.preventDefault();
    typedRef.current = `${typedRef.current}${event.key}`.slice(0, 2);
    onChange(typedRef.current);
    if (typedRef.current.length === 2) onComplete?.();
  };

  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      maxLength={2}
      aria-label={ariaLabel}
      value={value}
      onFocus={() => {
        typedRef.current = "";
        onFocus();
      }}
      onBlur={() => {
        const raw = typedRef.current === "" ? value : typedRef.current;
        onChange(pad(parseUnit(raw, max)));
      }}
      onKeyDown={onKeyDown}
      onChange={() => undefined}
      className={cn(
        "h-9 w-12 rounded-md text-center text-sm font-medium tabular-nums",
        "bg-transparent focus:outline-none",
        focused
          ? "bg-accent/15 text-accent"
          : "text-content ring-1 ring-border",
      )}
    />
  );
}
