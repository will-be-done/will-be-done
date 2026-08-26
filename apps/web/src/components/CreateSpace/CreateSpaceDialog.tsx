import { useRef, useState } from "react";
import {
  DEFAULT_DAY_END_MINUTES,
  DEFAULT_DAY_START_MINUTES,
  normalizeWorkday,
  SPACE_PREFERENCES_ID,
  spacePreferencesType,
  type WorkBreak,
} from "@will-be-done/slices/space";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WorkdayFields } from "@/components/SpaceSettings/WorkdayFields";

const STEPS = [
  {
    id: "name",
    description: "What should this space be called?",
  },
  {
    id: "hours",
    description: "Timed tasks fill this window.",
  },
  {
    id: "breaks",
    description: "Timed tasks skip these ranges.",
  },
] as const;

export type CreateSpaceValues = {
  name: string;
  dayStartMinutes: number;
  dayEndMinutes: number;
  breaks: WorkBreak[];
};

export function CreateSpaceDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (values: CreateSpaceValues) => Promise<void>;
}) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [dayStartMinutes, setDayStartMinutes] = useState(
    DEFAULT_DAY_START_MINUTES,
  );
  const [dayEndMinutes, setDayEndMinutes] = useState(DEFAULT_DAY_END_MINUTES);
  const [breaks, setBreaks] = useState<WorkBreak[]>([]);
  const [saving, setSaving] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const isLast = step === STEPS.length - 1;
  const current = STEPS[step]!;
  const trimmedName = name.trim();
  const canContinue = current.id !== "name" || trimmedName.length > 0;

  const updateWorkday = (next: {
    dayStartMinutes?: number;
    dayEndMinutes?: number;
    breaks?: WorkBreak[];
  }) => {
    if (next.dayStartMinutes != null) setDayStartMinutes(next.dayStartMinutes);
    if (next.dayEndMinutes != null) setDayEndMinutes(next.dayEndMinutes);
    if (next.breaks != null) setBreaks(next.breaks);
  };

  const close = () => {
    if (saving) return;
    onOpenChange(false);
  };

  const submit = async () => {
    if (!trimmedName || saving) return;
    setSaving(true);
    const workday = normalizeWorkday({
      type: spacePreferencesType,
      id: SPACE_PREFERENCES_ID,
      dayStartMinutes,
      dayEndMinutes,
      breaks,
    });
    try {
      await onCreate({
        name: trimmedName,
        ...workday,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const goNext = () => {
    if (!canContinue) return;
    if (isLast) {
      void submit();
      return;
    }
    setStep(step + 1);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) close();
      }}
    >
      <DialogContent
        className="flex min-h-88 w-full max-w-[calc(100%-2rem)] flex-col gap-5 overflow-hidden border-none bg-popover p-6 ring-1 ring-ring backdrop-blur-xl sm:max-w-md [&>button]:text-content-tinted"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          requestAnimationFrame(() => nameInputRef.current?.select());
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold text-content">
            New space
          </DialogTitle>
          <DialogDescription className="text-sm text-content-tinted">
            {current.description}
          </DialogDescription>
        </DialogHeader>

        <div
          className="flex items-center gap-2"
          aria-label={`Step ${step + 1} of ${STEPS.length}`}
        >
          {STEPS.map((item, index) => (
            <div
              key={item.id}
              className={cn(
                "h-1 flex-1 rounded-full",
                index <= step ? "bg-accent" : "bg-ring",
              )}
            />
          ))}
        </div>

        <form
          className="flex min-h-0 flex-1 flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            goNext();
          }}
        >
          <div className="min-h-0 flex-1">
            {current.id === "name" && (
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-content-tinted">
                  Space name
                </span>
                <input
                  ref={nameInputRef}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  aria-label="Space name"
                  placeholder="Personal"
                  className="w-full rounded-md border border-ring bg-surface px-3 py-2 text-sm text-content outline-none transition-shadow placeholder:text-content-tinted/50 focus:border-accent/60 focus:ring-2 focus:ring-accent/40"
                  autoComplete="off"
                />
              </label>
            )}

            {current.id === "hours" && (
              <WorkdayFields
                dayStartMinutes={dayStartMinutes}
                dayEndMinutes={dayEndMinutes}
                breaks={breaks}
                onChange={updateWorkday}
                showBreaks={false}
              />
            )}

            {current.id === "breaks" && (
              <div className="flex flex-col gap-3">
                <WorkdayFields
                  dayStartMinutes={dayStartMinutes}
                  dayEndMinutes={dayEndMinutes}
                  breaks={breaks}
                  onChange={updateWorkday}
                  showHours={false}
                />
                {breaks.length === 0 && (
                  <p className="text-[13px] text-content-tinted">
                    Optional. Skip this if you work straight through.
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="sm:justify-between">
            <button
              type="button"
              onClick={() => (step === 0 ? close() : setStep(step - 1))}
              disabled={saving}
              className="cursor-pointer rounded-md px-3.5 py-1.5 text-[13px] font-medium text-content-tinted transition-colors hover:bg-overlay hover:text-content disabled:opacity-50"
            >
              {step === 0 ? "Cancel" : "Back"}
            </button>
            <button
              type="submit"
              disabled={!canContinue || saving}
              className="cursor-pointer rounded-md bg-accent px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-accent/85 disabled:opacity-50"
            >
              {isLast ? (saving ? "Creating..." : "Create space") : "Next"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
