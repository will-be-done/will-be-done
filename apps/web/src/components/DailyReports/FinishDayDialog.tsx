import { useState } from "react";
import {
  useAsyncDispatch,
  useAsyncSelector,
} from "@will-be-done/hyperdb/react";
import {
  dailyListByDate,
  doneDailyEntryChildrenForDisplay,
  isTask,
  upsertDailyReport,
  type DailyReport,
  type DailyReportCompletedTask,
  type DailyReportRating,
} from "@will-be-done/slices/space";
import { cn } from "@/lib/utils.ts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { PreloadedTaskComp } from "@/components/Task/Task.tsx";
import {
  RATING_KEYS,
  RATING_SCALES,
  type RatingKey,
  type RatingOption,
} from "./ratings.ts";

const STEPS = [
  { id: "tasks", title: "Done today" },
  { id: "ratings", title: "How it felt" },
  { id: "notes", title: "Notes" },
] as const;

type Draft = {
  notes: string;
  mood: DailyReportRating | undefined;
  energy: DailyReportRating | undefined;
  focus: DailyReportRating | undefined;
  accomplishment: DailyReportRating | undefined;
};

const RatingQuestion = ({
  ratingKey,
  value,
  onChange,
}: {
  ratingKey: RatingKey;
  value: DailyReportRating | undefined;
  onChange: (value: DailyReportRating | null) => void;
}) => {
  const scale = RATING_SCALES[ratingKey];
  const selected = scale.options.find((option) => option.value === value);

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-panel px-4 py-4 ring-1 ring-ring">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-content">{scale.label}</span>
        <span className="text-xs text-content-tinted">
          {selected?.name ?? "Skip"}
        </span>
      </div>
      <div
        className="flex justify-between gap-1"
        role="group"
        aria-label={scale.label}
      >
        {scale.options.map((option: RatingOption) => {
          const pressed = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              title={option.name}
              aria-label={`${scale.label}: ${option.name}`}
              aria-pressed={pressed}
              onClick={() => onChange(pressed ? null : option.value)}
              className={cn(
                "flex size-12 cursor-pointer items-center justify-center rounded-full text-2xl transition-all",
                pressed
                  ? "bg-overlay scale-110"
                  : "opacity-40 hover:bg-overlay/60 hover:opacity-80",
              )}
            >
              <span aria-hidden="true">{option.emoji}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export const FinishDayDialog = ({
  dateKey,
  report,
  snapshot,
  onClose,
}: {
  dateKey: string;
  report: DailyReport | undefined;
  snapshot: DailyReportCompletedTask[];
  onClose: () => void;
}) => {
  const dispatch = useAsyncDispatch();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => ({
    notes: report?.notes ?? "",
    mood: report?.mood,
    energy: report?.energy,
    focus: report?.focus,
    accomplishment: report?.accomplishment,
  }));

  const { data: dailyList } = useAsyncSelector({
    selector: dailyListByDate,
    args: { date: dateKey },
  });
  const { data: doneItemsForDisplay = [] } = useAsyncSelector({
    selector: doneDailyEntryChildrenForDisplay,
    args: { dailyListId: dailyList?.id ?? "" },
    defaultValue: [],
  });

  const updateDraft = (patch: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const completedTasks = (): DailyReportCompletedTask[] => {
    const live = doneItemsForDisplay.flatMap(({ item }) =>
      isTask(item) ? [{ id: item.id, title: item.title }] : [],
    );
    if (live.length > 0) return live;
    return report?.completedTasks ?? snapshot;
  };

  const save = () => {
    setSaving(true);
    void dispatch(
      upsertDailyReport({
        date: dateKey,
        notes: draft.notes,
        completedTasks: completedTasks(),
        mood: draft.mood ?? null,
        energy: draft.energy ?? null,
        focus: draft.focus ?? null,
        accomplishment: draft.accomplishment ?? null,
      }),
    ).finally(() => {
      setSaving(false);
      onClose();
    });
  };

  const isLast = step === STEPS.length - 1;
  const current = STEPS[step]!;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[min(36rem,75vh)] w-full max-w-[calc(100%-2rem)] flex-col gap-5 overflow-hidden border-none bg-popover p-6 ring-1 ring-ring backdrop-blur-xl sm:max-w-xl [&>button]:text-content-tinted">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold text-content">
            Finish day
          </DialogTitle>
          <DialogDescription className="text-sm text-content-tinted">
            {current.title}
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

        <div className="min-h-0 flex-1 overflow-y-auto p-px">
          {current.id === "tasks" &&
            (doneItemsForDisplay.length === 0 ? (
              <p className="text-sm text-content-tinted">
                No completed tasks on this day yet.
              </p>
            ) : (
              <div className="flex flex-col gap-4 p-1">
                {doneItemsForDisplay.map((displayData) => (
                  <PreloadedTaskComp
                    key={displayData.listItem.id}
                    item={displayData.item}
                    section={displayData.section}
                    listItem={displayData.listItem}
                    project={displayData.project}
                    lastScheduleTime={displayData.lastScheduleTime}
                    hasCheclistItems={displayData.hasChecklist}
                    alwaysShowProject
                    displayLastScheduleTime
                    centerScheduleDate
                  />
                ))}
              </div>
            ))}

          {current.id === "ratings" && (
            <section className="flex flex-col gap-3 py-1">
              {RATING_KEYS.map((ratingKey) => (
                <RatingQuestion
                  key={ratingKey}
                  ratingKey={ratingKey}
                  value={draft[ratingKey]}
                  onChange={(value) =>
                    updateDraft({ [ratingKey]: value ?? undefined })
                  }
                />
              ))}
            </section>
          )}

          {current.id === "notes" && (
            <label className="flex h-full min-h-48 flex-col">
              <span className="sr-only">Notes</span>
              <textarea
                value={draft.notes}
                onChange={(event) => updateDraft({ notes: event.target.value })}
                placeholder="What happened today?"
                className="h-full min-h-48 w-full flex-1 resize-none rounded-md border border-ring bg-surface px-3 py-2 text-base leading-6 text-content outline-none placeholder:text-content-tinted/50 focus:border-accent/60 focus:ring-2 focus:ring-accent/40"
              />
            </label>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <button
            type="button"
            onClick={() => (step === 0 ? onClose() : setStep(step - 1))}
            className="cursor-pointer rounded-md px-3.5 py-1.5 text-[13px] font-medium text-content-tinted transition-colors hover:bg-overlay hover:text-content"
          >
            {step === 0 ? "Cancel" : "Back"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => (isLast ? save() : setStep(step + 1))}
            className="cursor-pointer rounded-md bg-accent px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-accent/85 disabled:opacity-50"
          >
            {isLast ? "Save" : "Next"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
