import { useCallback } from "react";
import { useDispatch, useSyncSelector } from "@will-be-done/hyperdb";
import {
  projectsSlice,
  stashProjectionsSlice,
  STASH_ID,
  stashType,
} from "@will-be-done/slices/space";
import { cn } from "@/lib/utils.ts";
import { buildFocusKey, useFocusStore } from "@/store/focusSlice.ts";
import { TaskComp } from "@/components/Task/Task.tsx";
import { TasksColumn } from "@/components/TasksGrid/TasksGrid.tsx";
import { createJSONStorage, persist } from "zustand/middleware";
import { create } from "zustand";

export const useStashOpen = create<{
  isOpen: boolean;
  toggle: () => void;
  setOpen: (v: boolean) => void;
}>()(
  persist(
    (set) => ({
      isOpen: false,
      toggle: () => set((s) => ({ isOpen: !s.isOpen })),
      setOpen: (v: boolean) => set({ isOpen: v }),
    }),
    {
      name: "stash-open",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

const StashColumnView = ({ onTaskAdd }: { onTaskAdd: () => void }) => {
  const taskIds = useSyncSelector(
    () => stashProjectionsSlice.childrenIds(),
    [],
  );

  const doneTaskIds = useSyncSelector(
    () => stashProjectionsSlice.doneChildrenIds(),
    [],
  );

  return (
    <TasksColumn
      isHidden={false}
      onHideClick={() => {}}
      header={null}
      columnModelId={STASH_ID}
      columnModelType={stashType}
    >
      <div className={cn("flex flex-col gap-4 w-full py-4 min-h-full")}>
        <button
          type="button"
          onClick={onTaskAdd}
          className="w-full flex items-center justify-center gap-2 text-sm text-content-tinted/60 hover:text-content-tinted py-1.5 transition-colors group cursor-pointer"
        >
          <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
            <svg
              width="8"
              height="8"
              viewBox="0 0 8 8"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M4 1v6M1 4h6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span>Add task</span>
        </button>
        {taskIds.map((id) => (
          <TaskComp
            key={id}
            taskId={id}
            cardWrapperId={id}
            cardWrapperType="stashProjection"
            alwaysShowProject
          />
        ))}
        {doneTaskIds.map((id) => (
          <TaskComp
            key={id}
            taskId={id}
            cardWrapperId={id}
            cardWrapperType="stashProjection"
            alwaysShowProject
          />
        ))}
      </div>
    </TasksColumn>
  );
};

export const FloatingStash = () => {
  const dispatch = useDispatch();
  const inboxId = useSyncSelector(() => projectsSlice.inboxProjectId(), []);
  const { isOpen, toggle } = useStashOpen();

  const handleAddTask = useCallback(() => {
    const task = dispatch(
      stashProjectionsSlice.createTaskInStash(inboxId, "prepend", "prepend"),
    );

    useFocusStore
      .getState()
      .editByKey(buildFocusKey(task.id, "stashProjection"));
  }, [dispatch, inboxId]);

  return (
    <div
      className={cn(
        "absolute left-0 top-0 h-full flex z-10",
        "transition-transform duration-200 ease-out",
      )}
      style={{
        transform: isOpen ? "translateX(0)" : "translateX(calc(-100% + 32px))",
      }}
    >
      <div
        className={cn(
          "w-[400px] h-full bg-surface/95 backdrop-blur-sm",
          "border-r border-ring/20",
          "overflow-hidden",
        )}
      >
        {isOpen && <StashColumnView onTaskAdd={handleAddTask} />}
      </div>

      <button
        type="button"
        onClick={toggle}
        className={cn(
          "flex items-center justify-center w-8 flex-shrink-0 h-full",
          "bg-panel-tinted/80 backdrop-blur-sm",
          "border-r border-ring/30",
          "cursor-pointer transition-colors",
          "hover:bg-panel-tinted",
          isOpen && "border-l border-ring/30",
        )}
      >
        <span
          className="text-xs font-bold uppercase tracking-widest text-content-tinted select-none"
          style={{
            writingMode: "vertical-rl",
            textOrientation: "mixed",
            transform: "rotate(180deg)",
          }}
        >
          stash
        </span>
      </button>
    </div>
  );
};
