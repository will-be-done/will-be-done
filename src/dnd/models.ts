export type DndModelData = {
  modelId: string;
  modelType: string;
};

export function isModelDNDData(data: unknown): data is DndModelData {
  return typeof data == "object" && data !== null && "modelId" in data;
}
