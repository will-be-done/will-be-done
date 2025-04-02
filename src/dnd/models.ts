export type TaskPassingData = {
  type: "task";
  listId: string;
  taskId: string;
  projectionId: string;
  instanceId: symbol;
};

export function isTaskPassingData(data: unknown): data is TaskPassingData {
  return (
    typeof data == "object" &&
    data !== null &&
    "type" in data &&
    data.type == "task"
  );
}
