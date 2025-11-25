import { TaskComp } from "../../../../components/Task/Task.tsx";
import { buildFocusKey, focusSlice2 } from "@/store2/slices/focusSlice.ts";
import { ParentListItemProvider } from "@/features/focus/components/ParentListProvider.tsx";
import { useCallback, useMemo, useState } from "react";
import { useDispatch, useSyncSelector } from "@will-be-done/hyperdb";
import {
  Project,
  projectItemsSlice2,
  taskGroupsSlice2,
} from "@will-be-done/slices";
import {
  TasksColumn,
  TasksColumnGrid,
} from "@/components/TasksGrid/TasksGrid.tsx";

export const ProjectItemsList2 = ({
  project,
  todoTaskIds,
  doneTaskIds,
}: {
  project: Project;
  todoTaskIds: string[];
  doneTaskIds: string[];
}) => {
  const dispatch = useDispatch();
  const id = useSyncSelector(() => focusSlice2.getFocusedModelId(), []);
  const idsToAlwaysInclude = useMemo(() => (id ? [id] : []), [id]);

  // const doneChildrenIds = useSyncSelector(
  //   () => projectItemsSlice2.doneChildrenIds(project.id, idsToAlwaysInclude),
  //   [project.id, idsToAlwaysInclude],
  // );
  // const notDoneChildrenIds = useSyncSelector(
  //   () => projectItemsSlice2.childrenIds(project.id, idsToAlwaysInclude),
  //   [project.id, idsToAlwaysInclude],
  // );

  const lastTaskI = todoTaskIds.length == 0 ? 0 : todoTaskIds.length - 1;

  const [isHiddenClicked, setIsHiddenClicked] = useState(false);
  const isHidden =
    isHiddenClicked || (doneTaskIds.length == 0 && todoTaskIds.length == 0);

  const handleHideClick = () => setIsHiddenClicked((v) => !v);

  const handleAddClick = () => {
    if (isHidden) {
      setIsHiddenClicked(false);
    }

    const task = dispatch(projectItemsSlice2.createTask(project.id, "prepend"));

    dispatch(focusSlice2.editByKey(buildFocusKey(task.id, task.type)));
  };

  const groups = useSyncSelector(
    () => taskGroupsSlice2.byProjectId(project.id),
    [project.id],
  );

  return (
    <>
      <TasksColumnGrid columnsCount={groups.length}>
        {groups.map((group, i) => (
          <TasksColumn
            key={group.id}
            focusKey={buildFocusKey(group.id, group.type, "ProjectItemsList")}
            orderNumber={500}
            isHidden={isHidden}
            onHideClick={handleHideClick}
            header={
              <>
                <div className="uppercase text-content text-xl font-bold ">
                  {group.title}
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
                  project.id,
                  project.type,
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
        ))}
      </TasksColumnGrid>
    </>
  );
};
