import { DndScope } from "@will-be-done/slices";

export type DndModelData = {
  modelId: string;
  modelType: string;
  scope: DndScope;
};

export function isModelDNDData(data: unknown): data is DndModelData {
  return typeof data == "object" && data !== null && "modelId" in data;
}

export type { DndScope };
