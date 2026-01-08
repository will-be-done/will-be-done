import { TaskComp } from "../Task/Task.tsx";
import { buildFocusKey, focusSlice } from "@/store/focusSlice.ts";
import { ParentListItemProvider } from "@/components/Focus/ParentListProvider.tsx";
import { useState } from "react";
import { useDispatch, useSyncSelector } from "@will-be-done/hyperdb";
import {
  dailyListsSlice,
  Project,
  projectCategoriesSlice,
  ProjectCategory,
} from "@will-be-done/slices";
import {
  TasksColumn,
  TasksColumnGrid,
} from "@/components/TasksGrid/TasksGrid.tsx";
import { projectCategoryCardsSlice } from "@will-be-done/slices";

const ProjectTasksColumn = ({
  project,
  category,
  exceptTaskIds,
}: {
  project: Project;
  category: ProjectCategory;
  exceptTaskIds?: Set<string>;
}) => {
  const dispatch = useDispatch();

  const todoTaskIds = useSyncSelector(
    () => projectCategoryCardsSlice.childrenIds(category.id),
    [category.id],
  );
  const doneTaskIds = useSyncSelector(
    () => projectCategoryCardsSlice.doneChildrenIds(category.id),
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
      projectCategoriesSlice.createTask(category.id, "prepend"),
    );

    dispatch(focusSlice.editByKey(buildFocusKey(task.id, task.type)));
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
      columnModelId={category.id}
      columnModelType={category.type}
      onAddClick={handleAddClick}
      actions={
        <>
          <button
            className="hidden group-hover:block cursor-pointer text-panel mb-2"
            type="button"
            onClick={() => {
              const title = prompt("Enter new name");
              if (!title) return;

              const [left, _right] = dispatch(
                projectCategoriesSlice.siblings(category.id),
              );

              dispatch(
                projectCategoriesSlice.createCategory(
                  {
                    projectId: category.projectId,
                    title,
                  },
                  [left, category],
                ),
              );
            }}
          >
            AL
          </button>
          <button
            className="hidden group-hover:block cursor-pointer text-panel mb-2"
            type="button"
            onClick={() => {
              const title = prompt("Enter new name");
              if (!title) return;

              const [_left, right] = dispatch(
                projectCategoriesSlice.siblings(category.id),
              );

              dispatch(
                projectCategoriesSlice.createCategory(
                  {
                    projectId: category.projectId,
                    title,
                  },
                  [category, right],
                ),
              );
            }}
          >
            AR
          </button>
          <button
            className="hidden group-hover:block cursor-pointer text-panel mb-2"
            type="button"
            onClick={() => {
              dispatch(projectCategoriesSlice.moveLeft(category.id));
            }}
          >
            ML
          </button>
          <button
            className="hidden group-hover:block cursor-pointer text-panel mb-2"
            type="button"
            onClick={() => {
              dispatch(projectCategoriesSlice.moveRight(category.id));
            }}
          >
            MR
          </button>
          <button
            className="hidden group-hover:block cursor-pointer text-panel mb-2"
            type="button"
            onClick={() => {
              const confirmed = confirm(
                "Are you sure you want to delete this project category?",
              );
              if (!confirmed) return;

              dispatch(projectCategoriesSlice.delete([category.id]));
            }}
          >
            D
          </button>
          <button
            className="hidden group-hover:block cursor-pointer text-panel mb-6"
            type="button"
            onClick={() => {
              const newTitle = prompt("Enter new title", category.title);
              if (!newTitle) return;

              dispatch(
                projectCategoriesSlice.updateCategory(category.id, {
                  title: newTitle,
                }),
              );
            }}
          >
            E
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4 w-full py-4">
        {(exceptTaskIds
          ? todoTaskIds.filter((id) => !exceptTaskIds.has(id))
          : []
        ).map((id, i) => {
          return (
            <TaskComp
              orderNumber={(i + 2).toString()}
              key={id}
              taskId={id}
              taskBoxId={id}
              displayedUnderProjectId={project.id}
              scope="project"
              displayLastScheduleTime
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
          {(exceptTaskIds
            ? doneTaskIds.filter((id) => !exceptTaskIds.has(id))
            : []
          ).map((id, i) => {
            return (
              <TaskComp
                orderNumber={i.toString()}
                key={id}
                taskId={id}
                taskBoxId={id}
                displayedUnderProjectId={project.id}
                scope="project"
                displayLastScheduleTime
              />
            );
          })}
        </ParentListItemProvider>
      </div>
    </TasksColumn>
  );
};

export const ProjectItemsList = ({
  project,
  exceptDailyListIds,
}: {
  project: Project;
  exceptDailyListIds?: string[];
}) => {
  const categories = useSyncSelector(
    () => projectCategoriesSlice.byProjectId(project.id),
    [project.id],
  );
  const exceptTaskIds = useSyncSelector(
    () => dailyListsSlice.allTaskIds(exceptDailyListIds ?? []),
    [exceptDailyListIds],
  );

  return (
    <>
      <TasksColumnGrid columnsCount={categories.length}>
        {categories.map((group) => (
          <ProjectTasksColumn
            key={group.id}
            category={group}
            project={project}
            exceptTaskIds={exceptTaskIds}
          />
        ))}
      </TasksColumnGrid>
    </>
  );
};
