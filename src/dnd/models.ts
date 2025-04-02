export type TaskPassingData = {
  type: "task";
  listId: string;
  taskId: string;
  projectionId: string;
  instanceId: symbol;
};

export type DailyListPassingData = {
  type: "dailyList";
  listId: string;
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

export function isDailyListPassingData(
  data: unknown,
): data is DailyListPassingData {
  return (
    typeof data == "object" &&
    data !== null &&
    "type" in data &&
    data.type == "dailyList"
  );
}
