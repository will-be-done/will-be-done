import {isObjectType} from "@/store/z.utils.ts";

export const taskTemplateType = "template";
export type TaskTemplate = {
    type: typeof taskTemplateType;
    id: string;
    projectId: string;
    orderToken: string;
    createdAt: number;
};
export const isTaskTemplate = isObjectType<TaskTemplate>(taskTemplateType);