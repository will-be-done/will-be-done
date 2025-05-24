import {FocusState} from "@/store/slices/focusSlice.ts";

const isObjectType =
    <T>(type: string) =>
        (p: unknown): p is T => {
            return typeof p == "object" && p !== null && "type" in p && p.type === type;
        };
export const projectType = "project";
export const taskType = "task";
export const taskTemplateType = "template";
export const projectionType = "projection";
export const dailyListType = "dailyList";
export const allTypes = [
    projectType,
    taskType,
    taskTemplateType,
    projectionType,
    dailyListType,
] as const;
export type Project = {
    type: typeof projectType;
    id: string;
    title: string;
    icon: string;
    isInbox: boolean;
    orderToken: string;
    createdAt: number;
};
export type ProjectItem = Task | TaskTemplate;
export type TaskState = "todo" | "done";
export type Task = {
    type: typeof taskType;
    id: string;
    title: string;
    state: TaskState;
    projectId: string;
    orderToken: string;
    lastToggledAt: number;
    horizon: "week" | "month" | "year" | "someday";
    createdAt: number;
};
export type TaskTemplate = {
    type: typeof taskTemplateType;
    id: string;
    projectId: string;
    orderToken: string;
    createdAt: number;
};
export type TaskProjection = {
    type: typeof projectionType;
    id: string;
    taskId: string;
    orderToken: string;
    dailyListId: string;
    createdAt: number;
};
export type TaskBox = Task | TaskProjection;
export type DailyList = {
    type: typeof dailyListType;
    id: string;
    date: string;
};
export type AnyModel =
    | Project
    | Task
    | TaskTemplate
    | TaskProjection
    | DailyList;
type ModelType<T> = T extends { type: infer U } ? U : never;
export type ModelTypeUnion = ModelType<AnyModel>;
export type ModelsMap = {
    [K in ModelTypeUnion]: Extract<AnyModel, { type: K }>;
};
export const isProject = isObjectType<Project>(projectType);
export const isTask = isObjectType<Task>(taskType);
export const isTaskTemplate = isObjectType<TaskTemplate>(taskTemplateType);
export const isTaskProjection = isObjectType<TaskProjection>(projectionType);
export const isDailyList = isObjectType<DailyList>(dailyListType);

export const inboxId = "01965eb2-7d13-727f-9f50-3d565d0ce2ef";
export type SyncableState = {
    [projectType]: {
        byIds: Record<string, Project>;
    };
    [taskType]: {
        byIds: Record<string, Task>;
    };
    [taskTemplateType]: {
        byIds: Record<string, TaskTemplate>;
    };
    [projectionType]: {
        byIds: Record<string, TaskProjection>;
    };
    [dailyListType]: {
        byIds: Record<string, DailyList>;
    };
};
export type RootState = SyncableState & {
    focus: FocusState;
};
export type AppModelChange = {
    id: string;
    modelType: ModelTypeUnion;
    isDeleted: boolean;
    model: AnyModel;
};