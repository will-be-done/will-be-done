import { Space, spacesTable } from "./spaces";

export type AnyTable = typeof spacesTable;
export type AnyModel = Space;
export type AnyModelType = AnyModel["type"];
