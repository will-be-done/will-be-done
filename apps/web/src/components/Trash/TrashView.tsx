import {
  useAsyncDispatch,
  useAsyncSelector,
} from "@will-be-done/hyperdb/react";
import {
  deleteTrashedTasks,
  emptyTrash,
  restoreTrashedTasks,
  TRASH_RETENTION_MS,
  trashedTasks,
  type TrashedTask,
} from "@will-be-done/slices/space";
import { formatDistanceToNow } from "date-fns";
import { StickyNote } from "lucide-react";
import { useCurrentDate } from "@/components/DaysBoard/hooks.tsx";

const DAY_MS = 24 * 60 * 60 * 1000;

const TrashRow = ({ row, now }: { row: TrashedTask; now: number }) => {
  const dispatch = useAsyncDispatch();
  const daysLeft = Math.max(
    0,
    Math.ceil((row.trashedAt + TRASH_RETENTION_MS - now) / DAY_MS),
  );

  const isNote = "note" in row;
  const title = isNote ? row.note.title : row.task.title;
  const isDone = !isNote && row.task.state === "done";

  const handleDelete = () => {
    if (!confirm(`Delete this ${isNote ? "note" : "task"} forever?`)) return;
    void dispatch(deleteTrashedTasks({ ids: [row.id] }));
  };

  return (
    <li className="flex items-center gap-3 rounded-lg px-3 py-2.5 ring-1 ring-ring/40 bg-surface">
      <div className="flex min-w-0 flex-1 flex-col">
        <span
          className={
            isDone
              ? "flex items-center gap-1.5 truncate text-[13px] text-content-tinted line-through"
              : "flex items-center gap-1.5 truncate text-[13px] text-content"
          }
        >
          {isNote && (
            <StickyNote className="size-3 shrink-0 text-content-tinted" />
          )}
          <span className="truncate">
            {title || (
              <span className="italic text-content-tinted">Untitled</span>
            )}
          </span>
        </span>
        <span className="text-[11px] text-content-tinted/60">
          Deleted {formatDistanceToNow(row.trashedAt, { addSuffix: true })} ·{" "}
          {daysLeft === 1 ? "1 day left" : `${daysLeft} days left`}
        </span>
      </div>
      <button
        type="button"
        onClick={() => void dispatch(restoreTrashedTasks({ ids: [row.id] }))}
        className="cursor-pointer rounded-md px-2.5 py-1 text-[12px] font-medium text-content-tinted transition-colors hover:bg-accent/10 hover:text-accent"
      >
        Restore
      </button>
      <button
        type="button"
        onClick={handleDelete}
        className="cursor-pointer rounded-md px-2.5 py-1 text-[12px] font-medium text-content-tinted transition-colors hover:bg-white/[0.05] hover:text-notice"
      >
        Delete forever
      </button>
    </li>
  );
};

export const TrashView = () => {
  const dispatch = useAsyncDispatch();
  const now = useCurrentDate().getTime();
  const { data: rows = [] } = useAsyncSelector({
    selector: trashedTasks,
    args: {},
  });

  const handleEmpty = () => {
    if (!confirm("Delete everything in the trash forever?")) return;
    void dispatch(emptyTrash({}));
  };

  return (
    <div className="h-full overflow-y-auto" id="main-scrollable-area">
      <div className="mx-auto max-w-lg px-4 pt-11 pb-8 sm:pt-5">
        <div className="mb-6 flex items-end gap-3">
          <div className="flex-1">
            <h1 className="text-3xl font-bold leading-tight text-content">
              Trash
            </h1>
            <p className="mt-1 text-[12px] text-content-tinted/60">
              Deleted tasks and notes are removed forever after 30 days.
            </p>
          </div>
          {rows.length > 0 && (
            <button
              type="button"
              onClick={handleEmpty}
              className="cursor-pointer rounded-md px-2.5 py-1 text-[12px] font-medium text-content-tinted transition-colors hover:bg-white/[0.05] hover:text-notice"
            >
              Empty trash
            </button>
          )}
        </div>

        {rows.length === 0 ? (
          <p className="py-12 text-center text-[13px] text-content-tinted/60">
            Trash is empty
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {rows.map((row) => (
              <TrashRow key={row.id} row={row} now={now} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
