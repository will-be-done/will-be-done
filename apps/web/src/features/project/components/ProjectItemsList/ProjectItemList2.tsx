import { TaskComp } from "../../../../components/Task/Task.tsx";
import { buildFocusKey, focusSlice2 } from "@/store2/slices/focusSlice.ts";
import { ParentListItemProvider } from "@/features/focus/components/ParentListProvider.tsx";
import { useCallback, useMemo, useState } from "react";
import { useDispatch, useSyncSelector } from "@will-be-done/hyperdb";
import {
  Project,
  projectCategoriesSlice2,
  ProjectCategory,
} from "@will-be-done/slices";
import {
  TasksColumn,
  TasksColumnGrid,
} from "@/components/TasksGrid/TasksGrid.tsx";
import { projectCategoryCardsSlice2 } from "@will-be-done/slices";

const ProjectTasksColumn = ({
  project,
  category,
}: {
  project: Project;
  category: ProjectCategory;
}) => {
  const dispatch = useDispatch();

  const todoTaskIds = useSyncSelector(
    () => projectCategoryCardsSlice2.childrenIds(category.id),
    [category.id],
  );
  const doneTaskIds = useSyncSelector(
    () => projectCategoryCardsSlice2.doneChildrenIds(category.id),
    [category.id],
  );
  const lastTaskI = todoTaskIds.length == 0 ? 0 : todoTaskIds.length - 1;

  const [isHiddenClicked, setIsHiddenClicked] = useState(false);
  const isHidden =
    isHiddenClicked || (doneTaskIds.length == 0 && todoTaskIds.length == 0);
  const handleAddClick = () => {
    if (isHidden) {
      setIsHiddenClicked(false);
    }

    const task = dispatch(
      projectCategoriesSlice2.createTask(category.id, "prepend"),
    );

    dispatch(focusSlice2.editByKey(buildFocusKey(task.id, task.type)));
  };
  const handleHideClick = () => setIsHiddenClicked((v) => !v);

  return (
    <TasksColumn
      focusKey={buildFocusKey(category.id, category.type, "ProjectItemsList")}
      orderNumber={500}
      isHidden={isHidden}
      onHideClick={handleHideClick}
      header={
        <>
          <div className="uppercase text-content text-xl font-bold ">
            {category.title}
          </div>
        </>
      }
      columnModelId={project.id}
      columnModelType={project.type}
      onAddClick={handleAddClick}
    >
      <div className="flex flex-col gap-4 w-full py-4">
        {todoTaskIds.map((id, i) => {
          return (
            <TaskComp
              orderNumber={(i + 2).toString()}
              key={id}
              taskId={id}
              taskBoxId={id}
              displayedUnderProjectId={project.id}
              displayLastProjectionTime
            />
          );
        })}
        <ParentListItemProvider
          focusKey={buildFocusKey(
            category.id,
            category.type,
            "DoneProjectionsList",
          )}
          priority={(lastTaskI + 2).toString()}
        >
          {doneTaskIds.map((id, i) => {
            return (
              <TaskComp
                displayLastProjectionTime
                orderNumber={i.toString()}
                key={id}
                taskId={id}
                taskBoxId={id}
                displayedUnderProjectId={project.id}
              />
            );
          })}
        </ParentListItemProvider>
      </div>
    </TasksColumn>
  );
};

export const ProjectItemsList2 = ({ project }: { project: Project }) => {
  const categories = useSyncSelector(
    () => projectCategoriesSlice2.byProjectId(project.id),
    [project.id],
  );

  return (
    <>
      <TasksColumnGrid columnsCount={categories.length}>
        {categories.map((group, i) => (
          <ProjectTasksColumn
            key={group.id}
            category={group}
            project={project}
          />
        ))}
      </TasksColumnGrid>
    </>
  );
};
