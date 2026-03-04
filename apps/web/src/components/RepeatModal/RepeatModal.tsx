import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogPanel } from "@headlessui/react";
import { RRule, Options as RRuleOptions } from "rrule";
import { RefreshCw, CalendarIcon, Timer } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useFocusStore } from "@/store/focusSlice.ts";
import { useUnmount } from "../../utils";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn as cnBase } from "@/lib/utils";

// Non-portaled popover content — stays inside the Dialog DOM tree so
// Headless UI's focus trap doesn't close it.
function InlinePopoverContent({
  className,
  align = "start",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Content
      align={align}
      sideOffset={sideOffset}
      className={cnBase(
        "z-50 w-auto rounded-lg border border-dialog-border bg-dialog-bg shadow-lg",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2",
        className,
      )}
      {...props}
    />
  );
}

type FreqMode = "minutely" | "daily" | "weekly" | "monthly" | "yearly";
type EndMode = "never" | "count" | "date";

interface ModalState {
  freq: FreqMode;
  interval: number;
  weekdays: number[];
  monthDay: number;
  yearMonth: number;
  yearDay: number;
  endMode: EndMode;
  count: number;
  until: string;
}

const RRULE_DAYS = [
  RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR, RRule.SA, RRule.SU,
];
const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const FREQ_ABBREV: Record<FreqMode, string> = {
  minutely: "min.", daily: "d.", weekly: "w.", monthly: "m.", yearly: "y.",
};

function todayISO() { return format(new Date(), "yyyy-MM-dd"); }

function freqFromRRule(freq: number): FreqMode {
  if (freq === RRule.MINUTELY) return "minutely";
  if (freq === RRule.WEEKLY)  return "weekly";
  if (freq === RRule.MONTHLY) return "monthly";
  if (freq === RRule.YEARLY)  return "yearly";
  return "daily";
}

function parseRule(ruleString?: string): ModalState {
  const defaults: ModalState = {
    freq: "daily", interval: 1, weekdays: [],
    monthDay: 1, yearMonth: 1, yearDay: 1,
    endMode: "never", count: 5, until: todayISO(),
  };
  if (!ruleString) return defaults;
  try {
    const rule = RRule.fromString(ruleString.trim());
    const opts = rule.options;
    const freq = freqFromRRule(opts.freq);
    const interval = opts.interval || 1;
    let weekdays: number[] = [];
    if (opts.byweekday && (opts.byweekday as unknown[]).length > 0)
      weekdays = (opts.byweekday as unknown[]).map((d) =>
        typeof d === "number" ? d : (d as { weekday: number }).weekday);
    const bmd = opts.bymonthday as number[] | null;
    const bm  = opts.bymonth  as number[] | null;
    const monthDay  = bmd?.length ? bmd[0]! : 1;
    const yearDay   = bmd?.length ? bmd[0]! : 1;
    const yearMonth = bm?.length  ? bm[0]!  : 1;
    let endMode: EndMode = "never", count = 5, until = todayISO();
    if (opts.count != null)      { endMode = "count"; count = opts.count; }
    else if (opts.until != null) { endMode = "date";  until = format(opts.until, "yyyy-MM-dd"); }
    return { freq, interval, weekdays, monthDay, yearMonth, yearDay, endMode, count, until };
  } catch { return defaults; }
}

function buildRRule(state: ModalState): RRule {
  const freqMap: Record<FreqMode, number> = {
    minutely: RRule.MINUTELY, daily: RRule.DAILY, weekly: RRule.WEEKLY, monthly: RRule.MONTHLY, yearly: RRule.YEARLY,
  };
  const opts: Partial<RRuleOptions> = { freq: freqMap[state.freq], interval: state.interval };
  if (state.freq === "weekly" && state.weekdays.length > 0)
    opts.byweekday = state.weekdays.map((d) => RRULE_DAYS[d]!);
  if (state.freq === "monthly") opts.bymonthday = [state.monthDay];
  if (state.freq === "yearly")  { opts.bymonth = [state.yearMonth]; opts.bymonthday = [state.yearDay]; }
  if (state.endMode === "count") opts.count = state.count;
  else if (state.endMode === "date" && state.until)
    try { opts.until = parseISO(state.until); } catch { /* ignore */ }
  return new RRule(opts);
}

function getNextOccurrences(rule: RRule, n: number): Date[] {
  const results: Date[] = [];
  let cursor = new Date();
  for (let i = 0; i < n; i++) {
    const next = rule.after(cursor, i === 0);
    if (!next) break;
    results.push(next);
    cursor = next;
  }
  return results;
}

// ─── Number input — no browser spinners ───────────────────────────────────

function NumInput({ value, min, max, width = "4rem", onChange }: {
  value: number; min: number; max: number; width?: string;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number" min={min} max={max} value={value}
      onChange={(e) => onChange(Math.min(max, Math.max(min, parseInt(e.target.value) || min)))}
      className={cn(
        "text-center text-content text-sm py-1.5 px-2 rounded-lg",
        "bg-transparent border border-border",
        "focus:outline-none focus:border-accent transition-colors",
        "[appearance:textfield]",
        "[&::-webkit-outer-spin-button]:appearance-none",
        "[&::-webkit-inner-spin-button]:appearance-none",
      )}
      style={{ width }}
    />
  );
}

// ─── Radio row ─────────────────────────────────────────────────────────────

function RadioRow({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <div onClick={onClick} className="flex items-center gap-3 cursor-pointer py-1.5">
      <div className={cn(
        "w-4 h-4 rounded-full shrink-0 flex items-center justify-center border transition-colors",
        active ? "border-accent" : "border-border",
      )}>
        {active && <div className="w-2 h-2 rounded-full bg-accent" />}
      </div>
      {children}
    </div>
  );
}

// ─── Section label ─────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold text-content-tinted-2 uppercase tracking-widest mb-3">
      {children}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export interface RepeatModalProps {
  initialRule?: string;
  onConfirm: (rule: string) => void;
  onCancel: () => void;
}

export function RepeatModal({ initialRule, onConfirm, onCancel }: RepeatModalProps) {
  const [state, setState] = useState<ModalState>(() => parseRule(initialRule));
  const [calendarOpen, setCalendarOpen] = useState(false);
  // Controlled so we can toggle it from both the button and RadioRow clicks

  useEffect(() => { useFocusStore.getState().disableFocus(); }, []);
  useUnmount(() => { useFocusStore.getState().enableFocus(); });

  const rule      = useMemo(() => buildRRule(state), [state]);
  const ruleText  = useMemo(() => rule.toText(), [rule]);
  const nextDates = useMemo(() => getNextOccurrences(rule, 3), [rule]);

  const set = <K extends keyof ModalState>(key: K, val: ModalState[K]) =>
    setState((s) => ({ ...s, [key]: val }));

  const toggleWeekday = (idx: number) =>
    setState((s) => ({
      ...s,
      weekdays: s.weekdays.includes(idx)
        ? s.weekdays.filter((d) => d !== idx)
        : [...s.weekdays, idx],
    }));

  const freqOptions: { value: FreqMode; label: string }[] = [
    { value: "minutely", label: "Minutely" },
    { value: "daily",    label: "Daily"    },
    { value: "weekly",   label: "Weekly"   },
    { value: "monthly",  label: "Monthly"  },
    { value: "yearly",   label: "Yearly"   },
  ];

  const selectedUntilDate = useMemo(() => {
    try { return state.until ? parseISO(state.until) : undefined; }
    catch { return undefined; }
  }, [state.until]);

  return (
    <Dialog static className="relative z-[60]" open onClose={onCancel}>
      <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <DialogPanel className="w-full max-w-2xl rounded-2xl overflow-hidden bg-dialog-bg ring-1 ring-dialog-border shadow-[0_32px_80px_rgba(0,0,0,0.85)]">

          {/* ── Header ─────────────────────────────────────────────────── */}
          <div className="flex items-center justify-center gap-2.5 px-6 py-4 border-b border-dialog-border">
            <RefreshCw className="h-[17px] w-[17px] text-accent" strokeWidth={2.5} />
            <h2 className="text-base font-semibold text-primary tracking-tight">Repeat</h2>
          </div>

          {/* ── Body ───────────────────────────────────────────────────── */}
          <div className="flex min-h-[400px]">

            {/* ── Left sidebar ─────────────────────────────────────────── */}
            <div className="w-48 shrink-0 flex flex-col bg-dialog-sidebar border-r border-dialog-border">
              {/* Frequency list */}
              <div className="flex-1 p-3 space-y-0.5">
                {freqOptions.map(({ value, label }) => {
                  const active = state.freq === value;
                  return (
                    <button
                      key={value}
                      onClick={() => set("freq", value)}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors",
                        active
                          ? "bg-dialog-item-active text-primary font-medium"
                          : "text-content-tinted hover:text-primary",
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Summary — single coherent block */}
              <div className="p-3 border-t border-dialog-border">
                <p className="text-[10px] font-semibold text-content-tinted-2 uppercase tracking-widest mb-2">
                  Summary
                </p>
                <p className="text-xs text-content-secondary leading-relaxed">
                  Repeat: {ruleText}
                </p>
                {nextDates.length > 0 && (
                  <p className="text-xs text-content-secondary leading-relaxed mt-1">
                    Next: {nextDates.map((d) => format(d, "MMM d")).join(" · ")}
                  </p>
                )}
              </div>
            </div>

            {/* ── Right panel — flat, no nested cards ──────────────────── */}
            <div className="flex-1 p-5 flex flex-col gap-5">

              {/* Repeat every */}
              <div>
                <SectionLabel>Repeat every</SectionLabel>
                <div className="flex items-center gap-2.5">
                  <NumInput value={state.interval} min={1} max={999} width="5rem"
                    onChange={(v) => set("interval", v)} />
                  <span className="text-sm text-content-tinted-2">{FREQ_ABBREV[state.freq]}</span>
                </div>
              </div>

              {/* Freq-specific — min-height keeps End section stable */}
              <div className="min-h-[72px]">

                {/* Minutely: hint */}
                {state.freq === "minutely" && (
                  <div>
                    <SectionLabel>Interval</SectionLabel>
                    <div className="flex items-center gap-2.5 text-sm text-content-tinted-2">
                      <Timer className="h-4 w-4 text-accent/70" />
                      <span>Repeats every {state.interval} minute{state.interval !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                )}

                {/* Weekly: day toggles */}
                {state.freq === "weekly" && (
                  <div>
                    <SectionLabel>Days of the week</SectionLabel>
                    <div className="flex gap-1.5">
                      {WEEKDAY_LABELS.map((label, idx) => {
                        const active = state.weekdays.includes(idx);
                        return (
                          <button
                            key={label}
                            onClick={() => toggleWeekday(idx)}
                            className={cn(
                              "flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors border cursor-pointer",
                              active
                                ? "bg-accent border-accent/40 text-white"
                                : "bg-transparent border-border text-content-tinted hover:text-primary",
                            )}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Monthly: day of month */}
                {state.freq === "monthly" && (
                  <div>
                    <SectionLabel>Day of month</SectionLabel>
                    <div className="flex items-center gap-2.5">
                      <NumInput value={state.monthDay} min={1} max={31}
                        onChange={(v) => set("monthDay", v)} />
                      <span className="text-sm text-content-tinted-2">day</span>
                    </div>
                  </div>
                )}

                {/* Yearly: day + month */}
                {state.freq === "yearly" && (
                  <div>
                    <SectionLabel>Day of year</SectionLabel>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <NumInput value={state.yearDay} min={1} max={31}
                        onChange={(v) => set("yearDay", v)} />
                      <span className="text-sm text-content-tinted-2">of</span>
                      <select
                        value={state.yearMonth}
                        onChange={(e) => set("yearMonth", parseInt(e.target.value))}
                        className="bg-dialog-bg text-content text-sm py-1.5 px-3 rounded-lg border border-border focus:outline-none focus:border-accent transition-colors"
                      >
                        {MONTH_NAMES.map((m, i) => (
                          <option key={m} value={i + 1}>{m}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

              </div>

              {/* End */}
              <div>
                <SectionLabel>End</SectionLabel>
                <div className="space-y-0.5">

                  <RadioRow active={state.endMode === "never"} onClick={() => set("endMode", "never")}>
                    <span className="text-sm text-content">Never</span>
                  </RadioRow>

                  <RadioRow active={state.endMode === "count"} onClick={() => set("endMode", "count")}>
                    <span className="text-sm text-content w-10 shrink-0">After</span>
                    <NumInput value={state.count} min={1} max={999} width="4rem"
                      onChange={(v) => { set("count", v); set("endMode", "count"); }} />
                    <span className="text-sm text-content-tinted-2">occurrences</span>
                  </RadioRow>

                  {/* Date — non-portaled Popover stays inside Dialog DOM tree */}
                  <RadioRow active={state.endMode === "date"} onClick={() => set("endMode", "date")}>
                    <span className="text-sm text-content w-10 shrink-0">On</span>
                    <PopoverPrimitive.Root
                      open={calendarOpen}
                      onOpenChange={setCalendarOpen}
                    >
                      <PopoverPrimitive.Trigger asChild>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            set("endMode", "date");
                            setCalendarOpen((o) => !o);
                          }}
                          className={cn(
                            "flex items-center gap-2 border text-sm py-1.5 px-3 rounded-lg transition-colors bg-transparent cursor-pointer",
                            state.endMode === "date"
                              ? "border-accent/50 text-content"
                              : "border-border text-content-tinted hover:text-content",
                          )}
                        >
                          <CalendarIcon className="h-3.5 w-3.5 text-content-secondary shrink-0" />
                          <span>
                            {selectedUntilDate ? format(selectedUntilDate, "MMM d, yyyy") : "Pick a date"}
                          </span>
                        </button>
                      </PopoverPrimitive.Trigger>
                      <InlinePopoverContent>
                        <Calendar
                          mode="single"
                          selected={selectedUntilDate}
                          onSelect={(date) => {
                            if (date) {
                              set("until", format(date, "yyyy-MM-dd"));
                              setCalendarOpen(false);
                            }
                          }}
                        />
                      </InlinePopoverContent>
                    </PopoverPrimitive.Root>
                  </RadioRow>

                </div>
              </div>

            </div>
          </div>

          {/* ── Footer ─────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 px-5 py-4 border-t border-dialog-border">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium text-content-tinted border border-border hover:bg-surface-elevated hover:text-content transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(rule.toString())}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-accent hover:bg-accent-hover transition-colors cursor-pointer"
            >
              Ok
            </button>
          </div>

        </DialogPanel>
      </div>
    </Dialog>
  );
}
