import { useAppSelector, useAppStore } from "@/hooks/stateHooks.ts";
import {
  buildFocusKey,
  focusSlice,
  parseColumnKey,
} from "@/store/slices/focusSlice.ts";
import { useState } from "react";
import { RepeatConfigModal } from "./RepeatConfigModal";
import { useDispatch, useSyncSelector } from "@will-be-done/hyperdb";
import {
  appSlice2,
  isTask,
  isTaskProjection,
  isTaskTemplate,
  Task,
  TaskProjection,
  tasksSlice2,
  TaskTemplate,
  taskTemplatesSlice2,
} from "@/store2/slices/store";

// TODO: rename to ModelDetails
export const Details = () => {
  const currentFocusKey = useAppSelector((state) => state.focus.focusItemKey);
  const { id } = currentFocusKey ? parseColumnKey(currentFocusKey) : {};
  const item = useSyncSelector(() => appSlice2.byId(id || ""), [id]);

  const task = useSyncSelector(
    () => tasksSlice2.byId(item?.id || ""),
    [item?.id],
  );

  if (isTask(item)) {
    return <TaskDetails task={item} showMakeTemplate={true} />;
  } else if (isTaskTemplate(item)) {
    return <TaskTemplateDetails taskTemplate={item} />;
  } else if (isTaskProjection(item)) {
    return <TaskProjectionDetails taskProjection={item} />;
  } else {
    return null;
  }
};

export const TaskProjectionDetails = ({
  taskProjection,
}: {
  taskProjection: TaskProjection;
}) => {
  const task = useSyncSelector(
    () => tasksSlice2.byIdOrDefault(taskProjection.taskId),
    [taskProjection.taskId],
  );

  return <TaskDetails task={task} showMakeTemplate={false} />;
};

export const TaskDetails = ({
  task,
  showMakeTemplate,
}: {
  task: Task;
  showMakeTemplate?: boolean;
}) => {
  const lastToggledAt = new Date(task.lastToggledAt);
  const createdAt = new Date(task.createdAt);
  const dispatch = useDispatch();
  const store = useAppStore();

  const [isRRuleModalOpen, setRRuleModalOpen] = useState(false);

  const currentFocusKey = useAppSelector((state) => state.focus.focusItemKey);
  const parsedFocusKey = currentFocusKey
    ? parseColumnKey(currentFocusKey)
    : undefined;

  return (
    <div>
      <h1 className="whitespace-break-spaces [overflow-wrap:anywhere]">
        {task.title}
      </h1>

      <div className="mt-4">
        Last toggled at: {lastToggledAt.toLocaleString()}
      </div>
      <div>Created at: {createdAt.toLocaleString()}</div>

      {showMakeTemplate && (
        <button type="button" onClick={() => setRRuleModalOpen(true)}>
          Make template
        </button>
      )}

      {isRRuleModalOpen && (
        <RepeatConfigModal
          isOpen={isRRuleModalOpen}
          onClose={() => setRRuleModalOpen(false)}
          onOk={(data, rule) => {
            setRRuleModalOpen(false);

            const template = dispatch(
              taskTemplatesSlice2.createFromTask(task, {
                repeatRule: rule.toString(),
              }),
            );

            if (parsedFocusKey) {
              focusSlice.focusByKey(
                store,
                buildFocusKey(
                  template.id,
                  template.type,
                  parsedFocusKey.component,
                ),
                true,
              );
            }
          }}
        />
      )}
    </div>
  );
};

export const TaskTemplateDetails = ({
  taskTemplate,
}: {
  taskTemplate: TaskTemplate;
}) => {
  const store = useAppStore();
  const currentFocusKey = useAppSelector((state) => state.focus.focusItemKey);
  const parsedFocusKey = currentFocusKey
    ? parseColumnKey(currentFocusKey)
    : undefined;
  const dispatch = useDispatch();

  const ruleText = useSyncSelector(
    () => taskTemplatesSlice2.ruleText(taskTemplate.id),
    [taskTemplate.id],
  );

  return (
    <div>
      <h1 className="whitespace-break-spaces [overflow-wrap:anywhere]">
        {taskTemplate.title}
      </h1>
      <div>It's task template!</div>
      <div className="my-2">Repeat freq: {ruleText}</div>
      <button
        type="button"
        onClick={() => {
          const task = dispatch(tasksSlice2.createFromTemplate(taskTemplate));

          // TODO: force react to rerender

          if (parsedFocusKey) {
            // setTimeout(() => {
            focusSlice.focusByKey(
              store,
              buildFocusKey(task.id, task.type, parsedFocusKey.component),
              true,
            );
            // }, 0);
          }
        }}
      >
        Make task
      </button>
    </div>
  );
};
