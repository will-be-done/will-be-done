# HyperDB Schemas

HyperDB tables can be declared directly with validator-backed schemas:

```ts
import { defineTable, v } from "@will-be-done/hyperdb";

export const projectCategoriesTable = defineTable("projectCategories", {
  id: v.string(),
  projectId: v.string(),
  orderToken: v.string(),
  name: v.string(),
}).index("byProjectIdOrderToken", ["projectId", "orderToken"]);
```

There is no project-level `defineSchema()` wrapper. HyperDB keeps a user-defined
`id` field and does not add Convex system fields like `_id` or `_creationTime`.

## Validators

The validator builder supports:

- `v.string()`, `v.number()`, `v.boolean()`, `v.null()`
- `v.array(item)`, `v.object(fields)`, `v.record(key, value)`
- `v.union(...)`, `v.literal(value)`, `v.optional(inner)`, `v.any()`

`ExtractSchema<typeof table>` is inferred from validators. `defineTable` schemas
must include `id`; missing `id` is rejected by TypeScript and at runtime.

The old `table<T>("name").withIndexes(...)` API remains available as a
compatibility layer, but new tables should use `defineTable`.

## Optional Fields

Optional fields are declared with `v.optional(...)`:

```ts
const tasksTable = defineTable("tasks", {
  id: v.string(),
  title: v.string(),
  content: v.optional(v.string()),
});
```

A missing optional field is valid. On insert or replacement update,
`{ content: undefined }` is normalized as if `content` were missing. Arrays with
`undefined` always throw.

## Unions, Literals, Null, And Undefined

Use `v.union` and `v.literal` for tagged values:

```ts
const tasksTable = defineTable("tasks", {
  id: v.string(),
  state: v.union(v.literal("todo"), v.literal("done")),
  completedAt: v.union(v.number(), v.null()),
});
```

`null` is a valid stored value. `undefined` is not a stored value. Query filters
do not use `undefined` to mean "field missing"; indexed query values remain
limited to `string | number | boolean | null`.

## Runtime Validation

Runtime record validation is configured per DB:

```ts
const db = new DB(driver, [tasksTable], { runtimeValidation: true });
```

When enabled, records are validated before insert/update and after driver reads.
Errors include the table name, record id when available, and field path. When
disabled, schema-derived TypeScript types still work, while runtime schema checks
are skipped. The persistence codec still rejects unsafe values such as
`undefined` in arrays and invalid object keys.

## SQLite Serialization

HyperDB normalizes documents before drivers see them and decodes documents after
driver reads. SQL drivers only perform final JSON storage formatting. This keeps
value semantics consistent across SQLite and in-memory drivers.

The codec rejects invalid `undefined`, strips schema-known optional
`undefined`, preserves `bigint`, and encodes byte values such as `ArrayBuffer`
and typed arrays.

## Index Limitations

Documents can contain richer values through validators and the codec, but indexed
fields are constrained to SQLite-comparable primitives:

```ts
defineTable("files", {
  id: v.string(),
  name: v.string(),
  data: v.any(),
}).index("byName", ["name"]);
```

Arrays, objects, bytes, `bigint`, and `v.any()` fields cannot be indexed in this
implementation.
