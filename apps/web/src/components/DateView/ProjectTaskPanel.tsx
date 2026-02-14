import { useMemo, useState } from "react";
import { useSyncSelector } from "@will-be-done/hyperdb";
import {
  projectsSlice,
  projectCategoriesSlice,
  projectCategoryCardsSlice,
} from "@will-be-done/slices/space";
import { TaskComp } from "@/components/Task/Task.tsx";
import { ColumnListProvider } from "@/components/Focus/ParentListProvider.tsx";
import { buildFocusKey } from "@/store/focusSlice.ts";

const CategorySection = ({
  categoryId,
  projectId,
}: {
  categoryId: string;
  projectId: string;
}) => {
  const category = useSyncSelector(
    () => projectCategoriesSlice.byIdOrDefault(categoryId),
    [categoryId],
  );

  const todoTaskIds = useSyncSelector(
    () => projectCategoryCardsSlice.childrenIds(categoryId),
    [categoryId],
  );

  const doneTaskIds = useSyncSelector(
    () => projectCategoryCardsSlice.doneChildrenIds(categoryId),
    [categoryId],
  );

  const [isShowMore, setIsShowMore] = useState(false);

  const visibleDoneIds = useMemo(() => {
    if (isShowMore) return doneTaskIds;
    return doneTaskIds.slice(0, 3);
  }, [doneTaskIds, isShowMore]);

  if (todoTaskIds.length === 0 && doneTaskIds.length === 0) {
    return null;
  }

  return (
    <div className="mb-4">
      <div className="text-xs uppercase text-subheader font-semibold mb-2 px-1">
        {category.title}
      </div>
      <ColumnListProvider
        focusKey={buildFocusKey(
          categoryId,
          category.type,
          "DateViewPanel",
        )}
        priority="100"
      >
        <div className="flex flex-col gap-2">
          {todoTaskIds.map((id, i) => (
            <TaskComp
              key={id}
              orderNumber={i.toString()}
              taskId={id}
              cardWrapperId={id}
              cardWrapperType="task"
              displayedUnderProjectId={projectId}
            />
          ))}
          {visibleDoneIds.map((id, i) => (
            <TaskComp
              key={id}
              orderNumber={(todoTaskIds.length + i).toString()}
              taskId={id}
              cardWrapperId={id}
              cardWrapperType="task"
              displayedUnderProjectId={projectId}
            />
          ))}
          {!isShowMore && doneTaskIds.length > 3 && (
            <button
              onClick={() => setIsShowMore(true)}
              className="cursor-pointer text-subheader text-sm px-1"
              type="button"
            >
              Show more ({doneTaskIds.length - 3})
            </button>
          )}
        </div>
      </ColumnListProvider>
    </div>
  );
};

export const ProjectTaskPanel = ({
  projectId,
}: {
  projectId: string;
}) => {
  const project = useSyncSelector(
    () => projectsSlice.byIdOrDefault(projectId),
    [projectId],
  );

  const categories = useSyncSelector(
    () => projectCategoriesSlice.byProjectId(projectId),
    [projectId],
  );

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 shrink-0">
        <span className="text-base">{project.icon || "🟡"}</span>
        <span className="text-sm font-semibold text-content truncate">
          {project.title}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {categories.map((cat) => (
          <CategorySection
            key={cat.id}
            categoryId={cat.id}
            projectId={projectId}
          />
        ))}
      </div>
    </div>
  );
};
