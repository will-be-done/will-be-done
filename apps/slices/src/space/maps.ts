import type { ActionGenerator, SelectorGenerator } from "@will-be-done/hyperdb";
import { AnyModel, AnyModelType, AnyTable } from "./tables";

type ModelSlice<T> = {
  byId: (id: string) => SelectorGenerator<T | undefined>;
  delete: (ids: string[]) => ActionGenerator<void>;
  canDrop: (
    id: string,
    dropId: string,
    dropModelType: AnyModelType,
  ) => SelectorGenerator<boolean>;
  handleDrop: (
    id: string,
    dropId: string,
    dropModelType: AnyModelType,
    edge: "top" | "bottom",
  ) => ActionGenerator<void>;
};

type RegisteredModelSlice = {
  byId: (...args: never[]) => SelectorGenerator<AnyModel | undefined>;
  delete: (...args: never[]) => ActionGenerator<void>;
  canDrop: (...args: never[]) => SelectorGenerator<boolean>;
  handleDrop: (...args: never[]) => ActionGenerator<void>;
};

type ObjectCommand = {
  (args: Record<string, unknown>): ActionGenerator<unknown>;
  args?: Record<string, unknown>;
};

export const appTypeTablesMap: Record<string, AnyTable> = {};
export const appTypeSlicesMap: Record<string, ModelSlice<AnyModel>> = {};

const positionalObjectArgs = (
  command: ObjectCommand,
  values: unknown[],
): Record<string, unknown> => {
  const keys = Object.keys(command.args || {});
  return Object.fromEntries(keys.map((key, index) => [key, values[index]]));
};

const callRegistered = <TGenerator extends ActionGenerator<unknown>>(
  command: ObjectCommand,
  values: unknown[],
): TGenerator => command(positionalObjectArgs(command, values)) as TGenerator;

export const registerModelSlice = (
  slice: RegisteredModelSlice,
  table: AnyTable,
  modelType: string,
) => {
  appTypeTablesMap[modelType] = table;
  appTypeSlicesMap[modelType] = {
    byId: (id) => callRegistered(slice.byId as unknown as ObjectCommand, [id]),
    delete: (ids) =>
      callRegistered(slice.delete as unknown as ObjectCommand, [ids]),
    canDrop: (id, dropId, dropModelType) =>
      callRegistered(slice.canDrop as unknown as ObjectCommand, [
        id,
        dropId,
        dropModelType,
      ]),
    handleDrop: (id, dropId, dropModelType, edge) =>
      callRegistered(slice.handleDrop as unknown as ObjectCommand, [
        id,
        dropId,
        dropModelType,
        edge,
      ]),
  };
};
