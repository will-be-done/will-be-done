# HyperDB Schema Goals

Adopt Convex-like table schemas in `apps/hyperdb-lib`, but keep the API table-local.
There should be no `defineSchema()` project wrapper. A table should be declared directly:

Use `./convex.md` as behavioral inspiration only. If it conflicts with this file, `goal.md` wins.

```ts
export const projectCategoriesTable = defineTable("projectCategories", {
  id: v.string(),
  projectId: v.string(),
  orderToken: v.string(),
  name: v.string(),
}).index("byProjectIdOrderToken", ["projectId", "orderToken"]);
```

Existing query ergonomics must continue to work:

```ts
runQuery(
  selectFrom(projectCategoriesTable, "byProjectIdOrderToken").where((q) =>
    projectIds.map((id) => q.eq("projectId", id)),
  ),
);
```

## Non-Goals

- Do not implement `defineSchema()`.
- Do not implement Convex's `v.id(table)` validator yet.
- Do not add Convex system fields like `_id` or `_creationTime`.
- Do not require generated code.
- Do not change existing query call sites such as `selectFrom(...).where(...)`.

## HyperDB Decisions

- Every table document must have an `id` field.
- `id` is user-defined in the schema, usually as `v.string()`.
- Missing `id` in `defineTable` must fail at the TypeScript level and at runtime table creation.
- HyperDB keeps `id`, not Convex `_id`.
- Runtime record validation is configurable when creating a DB instance, with an option like `new DB(driver, tables, { runtimeValidation: true })`.
- When runtime validation is enabled, HyperDB validates records before insert/update and after reading records from drivers.
- When runtime validation is disabled, TypeScript inference still works but runtime insert/update/read validation is skipped.
- Empty object keys and keys starting with `$` are invalid.
- Keys starting with `_` are allowed because HyperDB does not use Convex system fields.
- `{ field: undefined }` on insert/replace is normalized as if the field were missing when the field is optional.
- `undefined` in arrays always throws.
- Query filters do not support `undefined` in the first implementation. Keep query `Value` as `string | number | boolean | null` unless a later goal explicitly expands it.

## Testing Requirement

- Add detailed tests for each goal section as it is implemented.
- Tests should prove the feature works correctly, not just cover happy paths.
- Include failure-case tests for validation, typing assumptions where practical, serialization boundaries, and runtime validation on/off behavior.
- Do not move to the next goal section until the current section has focused tests that would fail without the implementation.

## Goal 1: Add Convex-Like Validators

Implement a new validator module, probably `src/hyperdb/values.ts`.

Scope:

- Add `v.string()`, `v.number()`, `v.boolean()`, `v.null()`, `v.array()`, `v.object()`, `v.record()`, `v.union()`, `v.literal()`, `v.optional()`, and `v.any()`.
- Do not add Convex's `v.id(table)` validator yet. HyperDB ids should be modeled with regular validators, usually `v.string()`.
- Optional: add a type helper for extracting a TypeScript type from a standalone validator if it naturally falls out of the implementation.
- The required type inference is table-level inference through `defineTable` and `ExtractSchema`.
- Enforce Convex-style runtime rules:
  - `undefined` is not a valid stored value.
  - Optional object fields may be missing.
  - Arrays cannot contain `undefined`.
  - Object keys cannot be empty or start with `$`.
  - Object keys starting with `_` are allowed.
  - Record keys are dynamic ASCII keys.
- Add focused validator tests.

## Goal 2: Replace Phantom Table Types With `defineTable`

Current `table<T>("name").withIndexes(...)` only carries TypeScript type information.
Replace or extend it with validator-backed table definitions.

Acceptance:

- `ExtractSchema<typeof projectCategoriesTable>` is inferred from validators.
- Every `defineTable` schema must include an `id` field.
- Missing `id` in a `defineTable` schema must be a TypeScript error.
- The `id` field should also be checked at runtime when table definitions are created.
- `selectFrom(table, index).where(...)` keeps its current type inference.
- Index columns remain type-checked against document fields.
- Index declarations can be chained with `.index(name, columns)`.
- Keep a compatibility layer for old `table<T>()` only if migration needs it.

## Goal 3: Validate Writes In The DB Layer

Hook table validators into write and read paths, guarded by a DB runtime validation option.

Likely files:

- `src/hyperdb/db.ts`
- `src/hyperdb/action.ts`
- `src/hyperdb/cachedDB.ts`

Rules:

- Add a DB option like `runtimeValidation: boolean`.
- `insert(table, records)` validates full documents before any driver sees them when runtime validation is enabled.
- `update(table, records)` validates full replacement documents before any driver sees them when runtime validation is enabled, because current update is effectively insert-or-replace.
- `intervalScan(...)` validates decoded records after driver reads and before returning them to callers when runtime validation is enabled.
- Validation should also apply inside transactions and action dispatch paths because they route through the same DB/Tx methods.
- When runtime validation is disabled, skip runtime record validation but keep codec normalization rules required for safe persistence.
- Error messages include table name, record id when available, and field path.
- Empty write batches remain no-op.

## Goal 4: Add Convex-Compatible Serialization

SQLite currently stores documents with `JSON.stringify`, which silently drops object fields with `undefined` and cannot represent some Convex-like values.

Create a codec layer before any driver usage and after any driver reads.
Drivers should receive already-normalized encoded documents, and callers should receive decoded runtime documents.
SQLite is the immediate persistence backend affected by this, but the rule should live at the HyperDB boundary so all current and future drivers get the same value semantics.

Scope:

- Reject invalid `undefined` before serialization.
- Strip `undefined` object fields only where the chosen Convex-compatible semantics allow missing optional fields.
- Reject `undefined` in arrays.
- Preserve or encode non-JSON values if supported:
  - `bigint` / `int64`
  - `ArrayBuffer` / bytes
- Decode rows back into runtime values after `JSON.parse`.

Likely location:

- reusable codec helpers in the core HyperDB layer, called before delegating to drivers and after reading from drivers.
- SQL drivers should still avoid inline `JSON.stringify` / `JSON.parse` for document semantics; they should only perform final storage formatting if needed.

## Goal 5: Define Null vs Undefined Semantics Explicitly

Document and test the exact behavior.

Rules to cover:

- `null` is a valid stored value.
- `undefined` is not a stored value.
- A missing optional field is valid.
- `{ field: undefined }` on insert/replace is treated as missing when the field is optional.
- Arrays with `undefined` always throw.
- Query filters cannot use `undefined` to mean "field missing" in the first implementation.

Note: Current query `Value` is only `string | number | boolean | null`, so query-time `undefined` support should be a deliberate separate change.

## Goal 6: Expand Or Constrain Query Value Types

Current indexed/query values are:

```ts
string | number | boolean | null
```

Convex supports richer document values. HyperDB should decide what can be indexed and queried through SQLite JSON indexes.

Minimum useful scope:

- Allow rich values in documents if validators/codecs support them.
- Keep indexable values limited to SQLite-comparable primitives.
- Reject indexes over unsupported fields at table definition time when possible.

Later optional scope:

- Add stable ordering/encoding for `bigint`, bytes, arrays, and objects if Convex-like total ordering becomes necessary.

## Goal 7: Migrate Existing Table Definitions

After the library supports `defineTable`, update consumers that import `@will-be-done/hyperdb`.

Pattern:

```ts
// old
table<ProjectCategory>("projectCategories").withIndexes({
  byProjectIdOrderToken: {
    type: "btree",
    cols: ["projectId", "orderToken"],
  },
});

// new
defineTable("projectCategories", {
  id: v.string(),
  projectId: v.string(),
  orderToken: v.string(),
  name: v.string(),
}).index("byProjectIdOrderToken", ["projectId", "orderToken"]);
```

Acceptance:

- Existing `selectFrom`, `insert`, `update`, `runQuery`, and dispatch usage keeps compiling.
- Type errors reveal real schema mismatches.
- Tests cover at least one migrated table end to end.

## Goal 8: Add Documentation And Examples

Add a short README section or docs file inside `apps/hyperdb-lib`.

Cover:

- `defineTable`
- validators
- optional fields
- unions and literals
- null vs undefined
- SQLite serialization behavior
- index limitations

## Done When

- The relevant `apps/hyperdb-lib` test command passes.
- The relevant `apps/hyperdb-lib` TypeScript check passes.
- Each goal section has detailed tests validating that the step was completed correctly.
- TypeScript catches a `defineTable` schema without `id`.
- Runtime table creation rejects a schema without `id`.
- With `runtimeValidation: true`, invalid writes are rejected before any driver sees them.
- With `runtimeValidation: true`, invalid driver-read records are rejected before callers receive them.
- With `runtimeValidation: false`, runtime record validation is skipped while schema-derived TypeScript types still work.
- Driver reads are decoded before values are returned to callers.
- Existing query builder ergonomics still compile.
- Documentation explains the intentional differences from Convex.
