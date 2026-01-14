import { AnyModelType } from "@will-be-done/slices";

export type DndModelData = {
  modelId: string;
  modelType: AnyModelType;
};

export function isModelDNDData(data: unknown): data is DndModelData {
  return typeof data == "object" && data !== null && "modelId" in data;
}
