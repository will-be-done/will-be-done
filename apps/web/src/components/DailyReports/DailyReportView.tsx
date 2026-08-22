import { useState } from "react";
import { format, parse } from "date-fns";
import { useAsyncSelector } from "@will-be-done/hyperdb/react";
import {
  completedTasksSnapshotForDate,
  dailyReportsNewest,
  type DailyReport,
  type DailyReportCompletedTask,
  type DailyReportRating,
} from "@will-be-done/slices/space";
import { useCurrentDMY } from "@/components/DaysBoard/hooks.tsx";
import { FinishDayDialog } from "./FinishDayDialog.tsx";
import { RATING_KEYS, RATING_SCALES, ratingOption } from "./ratings.ts";

type ReportCard = {
  date: string;
  isDraft: boolean;
  tasks: DailyReportCompletedTask[];
  notes: string;
  mood?: DailyReportRating;
  energy?: DailyReportRating;
  focus?: DailyReportRating;
  accomplishment?: DailyReportRating;
};

const parseDateKey = (dateKey: string) =>
  parse(dateKey, "yyyy-MM-dd", new Date());

const RatingStat = ({
  ratingKey,
  value,
}: {
  ratingKey: (typeof RATING_KEYS)[number];
  value: DailyReportRating | undefined;
}) => {
  const option = ratingOption(ratingKey, value);
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold tracking-wide text-content-tinted uppercase">
        {RATING_SCALES[ratingKey].label}
      </span>
      {option ? (
        <span className="flex items-center gap-1.5 text-sm text-content">
          <span aria-hidden="true" className="text-base leading-none">
            {option.emoji}
          </span>
          {option.name}
        </span>
      ) : (
        <span className="text-sm text-content-tinted">—</span>
      )}
    </div>
  );
};

const DailyReportCard = ({
  card,
  onOpen,
}: {
  card: ReportCard;
  onOpen: () => void;
}) => {
  const date = parseDateKey(card.date);
  const ratings = {
    mood: card.mood,
    energy: card.energy,
    focus: card.focus,
    accomplishment: card.accomplishment,
  };
  const hasRatings = RATING_KEYS.some((key) => ratings[key] !== undefined);

  return (
    <article>
      <div className="mb-8 flex items-center gap-3">
        <div className="h-px flex-1 bg-ring" />
        <span className="text-xs text-content-tinted">
          {format(date, "MMMM do")}
        </span>
        <div className="h-px flex-1 bg-ring" />
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="flex w-full cursor-pointer flex-col gap-6 text-left sm:flex-row sm:gap-10"
      >
        <div className="min-w-0 flex-1">
          {card.isDraft && (
            <span className="mb-1 block text-xs text-content-tinted">
              Draft
            </span>
          )}
          <h2 className="text-3xl font-bold leading-none text-content">
            {format(date, "EEEE")}
          </h2>
          {card.tasks.length === 0 ? (
            <p className="mt-4 text-sm text-content-tinted">
              {card.isDraft ? "No completed tasks yet." : "No tasks saved."}
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
              {card.tasks.map((task) => (
                <li
                  key={task.id}
                  className="flex items-start gap-2.5 text-sm text-content"
                >
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                  <span>{task.title}</span>
                </li>
              ))}
            </ul>
          )}
          {card.notes.trim() !== "" && (
            <p className="mt-4 text-sm leading-6 text-content-tinted whitespace-pre-wrap">
              {card.notes}
            </p>
          )}
        </div>

        {hasRatings && (
          <div className="flex w-full shrink-0 flex-col gap-3 sm:w-36">
            {RATING_KEYS.map((key) => (
              <RatingStat key={key} ratingKey={key} value={ratings[key]} />
            ))}
          </div>
        )}
      </button>
    </article>
  );
};

const toCard = (report: DailyReport): ReportCard => ({
  date: report.date,
  isDraft: false,
  tasks: report.completedTasks,
  notes: report.notes,
  mood: report.mood,
  energy: report.energy,
  focus: report.focus,
  accomplishment: report.accomplishment,
});

export const DailyReportView = () => {
  const todayKey = useCurrentDMY();
  const [editingDate, setEditingDate] = useState<string | null>(null);

  const { data: reports = [] } = useAsyncSelector({
    selector: dailyReportsNewest,
    args: {},
  });
  const { data: todaySnapshot = [] } = useAsyncSelector({
    selector: completedTasksSnapshotForDate,
    args: { date: todayKey },
  });

  const todaySaved = reports.some((report) => report.date === todayKey);
  const cards: ReportCard[] = todaySaved
    ? reports.map(toCard)
    : [
        {
          date: todayKey,
          isDraft: true,
          tasks: todaySnapshot,
          notes: "",
        },
        ...reports.map(toCard),
      ];

  return (
    <div className="h-full w-full min-w-0 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-5 py-6">
        <div className="mb-4 flex items-center justify-end">
          <button
            type="button"
            onClick={() => setEditingDate(todayKey)}
            className="cursor-pointer rounded-md bg-accent px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-accent-hover"
          >
            {todaySaved ? "Edit today" : "Finish day"}
          </button>
        </div>

        <div className="flex flex-col gap-12 pb-16">
          {cards.map((card) => (
            <DailyReportCard
              key={card.date}
              card={card}
              onOpen={() => setEditingDate(card.date)}
            />
          ))}
        </div>
      </div>

      {editingDate && (
        <FinishDayDialog
          key={editingDate}
          dateKey={editingDate}
          report={reports.find((report) => report.date === editingDate)}
          snapshot={editingDate === todayKey ? todaySnapshot : []}
          onClose={() => setEditingDate(null)}
        />
      )}
    </div>
  );
};
