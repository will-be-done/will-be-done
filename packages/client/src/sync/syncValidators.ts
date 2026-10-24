import { v, type TableDefinition, type Validator } from "@will-be-done/hyperdb";
import type { PrimitiveRow } from "@will-be-done/slices/common";

const primitiveValueSchema = v.union(
  v.string(),
  v.number(),
  v.boolean(),
  v.null(),
);

const primitiveRowSchema = v.record(
  v.string(),
  primitiveValueSchema,
) as Validator<PrimitiveRow>;

const tableDefinitionArgSchema = v.pass<TableDefinition>();

export const syncableTableNameMapSchema = v.record(
  v.string(),
  tableDefinitionArgSchema,
) as Validator<Record<string, TableDefinition>>;

const changeSchema = v.object({
  id: v.string(),
  entityId: v.string(),
  tableName: v.string(),
  deletedAt: v.union(v.string(), v.null()),
  clientId: v.string(),
  changes: v.record(v.string(), v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
});

export const changesetArraySchema = v.array(
  v.object({
    tableName: v.string(),
    data: v.array(
      v.object({
        row: v.optional(primitiveRowSchema),
        change: changeSchema,
      }),
    ),
  }),
);
