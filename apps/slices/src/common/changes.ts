import {
  deleteRows,
  insert,
  Row,
  selectFrom,
  TableDefinition,
  upsert,
  type Validator,
  v,
} from "@will-be-done/hyperdb";
import { action, selector } from "../builders";
import { isEqual } from "es-toolkit";
import { uniq } from "es-toolkit/array";
import { z } from "zod";
import { groupBy } from "es-toolkit";
import { changesTable, type Change } from "./tables";
import { compareHlc, formatHlc } from "./hlc";
import type { ClientCursor } from "./syncV4";
import {
  loadRichTextDoc,
  mergeRichTextDocs,
  replaceRichTextDocMarkdown,
  richTextDocToMarkdown,
  type RichTextKind,
} from "./richText";

export { changesTable, type Change } from "./tables";

export type PrimitiveValue = string | number | boolean | null;
export type PrimitiveRow = Record<string, PrimitiveValue> & { id: string };

const SELECT_OR_CHUNK_SIZE = 400;

type RichTextField = {
  docField: string;
  textField: string;
  kind: RichTextKind;
};

const richTextFieldsByTable = new Map<string, readonly RichTextField[]>();

// A Yjs doc field merges by CRDT union instead of LWW, and its markdown text
// field is always re-derived from the merged doc.
export const registerRichTextFields = (
  tableName: string,
  fields: readonly RichTextField[],
) => {
  richTextFieldsByTable.set(tableName, fields);
};

const decodes = (doc: unknown): doc is string => {
  if (typeof doc !== "string") return false;
  try {
    loadRichTextDoc(doc).destroy();
    return true;
  } catch {
    return false;
  }
};

// A doc that does not decode is dropped: the row keeps its text, and the next
// edit seeds a doc from it again.
const withoutDoc = (row: Row, docField: string): Row => {
  const { [docField]: _, ...rest } = row;
  return rest as Row;
};

const mergeRichTextFields = (
  tableName: string,
  currentRow: Row | undefined,
  incomingRow: Row | undefined,
  mergedRow: Row,
): Row => {
  const fields = richTextFieldsByTable.get(tableName);
  if (!fields || !incomingRow) return mergedRow;
  let result = mergedRow;
  for (const { docField, textField, kind } of fields) {
    if (!currentRow) {
      const doc = result[docField];
      if (doc !== undefined && !decodes(doc)) {
        result = withoutDoc(result, docField);
      }
      continue;
    }
    if (
      currentRow[docField] === incomingRow[docField] &&
      currentRow[textField] === incomingRow[textField]
    ) {
      continue;
    }
    const docOf = (row: Row) =>
      decodes(row[docField]) ? row[docField] : undefined;
    const currentDoc = docOf(currentRow);
    const incomingDoc = docOf(incomingRow);
    // Clients that predate docs change only the text, leaving their doc stale
    // or absent. A text that won LWW is replayed as an edit of the doc it was
    // written against, so it merges instead of being dropped.
    const textEdit = (
      row: Row,
      other: Row,
      own: string | undefined,
      otherDoc: string | undefined,
    ) => {
      const text = row[textField];
      if (
        typeof text !== "string" ||
        text !== mergedRow[textField] ||
        text === other[textField] ||
        (own !== undefined && richTextDocToMarkdown(own, kind) === text)
      ) {
        return undefined;
      }
      const base = own ?? otherDoc;
      return base === undefined
        ? undefined
        : replaceRichTextDocMarkdown(base, text, kind);
    };
    try {
      const docs = [
        currentDoc,
        incomingDoc,
        textEdit(currentRow, incomingRow, currentDoc, incomingDoc),
        textEdit(incomingRow, currentRow, incomingDoc, currentDoc),
      ].filter((doc) => doc !== undefined);
      if (docs.length === 0) {
        result = withoutDoc(result, docField);
        continue;
      }
      const doc = docs.reduce(mergeRichTextDocs);
      result = {
        ...result,
        [docField]: doc,
        [textField]: richTextDocToMarkdown(doc, kind),
      };
    } catch (error) {
      // A doc that decodes but fails to merge must not block the changeset.
      console.error(`Failed to merge ${tableName}.${docField}`, error);
      result =
        currentDoc === undefined
          ? withoutDoc(result, docField)
          : {
              ...result,
              [docField]: currentDoc,
              [textField]: currentRow[textField],
            };
    }
  }
  return result;
};
export const changeId = (tableName: string, entityId: string): string =>
  `${tableName}:${entityId}`;
const primitiveValueSchema = v.union(
  v.string(),
  v.number(),
  v.boolean(),
  v.null(),
);
const rowSchema = v.record(
  v.string(),
  primitiveValueSchema,
) as Validator<PrimitiveRow>;
export const tableDefinitionArgSchema = v.pass<TableDefinition>();
const changeSchema = v.object({
  id: v.string(),
  entityId: v.string(),
  tableName: v.string(),
  deletedAt: v.union(v.string(), v.null()),
  restoredAt: v.optional(v.string()),
  rivalCreations: v.optional(v.array(v.string())),
  clientId: v.string(),
  changes: v.record(v.string(), v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
});
export const changesetArrayValidator = v.array(
  v.object({
    tableName: v.string(),
    data: v.array(
      v.object({
        row: v.optional(rowSchema),
        change: changeSchema,
      }),
    ),
  }),
);

const chunkArray = <T>(items: T[], chunkSize: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
};

const compareOptionalHlc = (
  left: string | undefined,
  right: string | undefined,
) =>
  left === right
    ? 0
    : left === undefined
      ? -1
      : right === undefined
        ? 1
        : compareHlc(left, right);

const maxOptionalHlc = (left: string | undefined, right: string | undefined) =>
  compareOptionalHlc(left, right) >= 0 ? left : right;

/** An entity is deleted unless a later restore clock revived it. */
export const isDeletedChange = (change: {
  deletedAt: string | null;
  restoredAt?: string;
}) =>
  change.deletedAt !== null &&
  compareOptionalHlc(change.deletedAt, change.restoredAt) > 0;

const getChangeByEntityAndTableName = selector({
  name: "getChangeByEntityAndTableName",
  args: {
    entityId: v.string(),
    tableName: v.string(),
  },
  handler: function* getChangeByEntityAndTableName({ entityId, tableName }) {
    return (yield* selectFrom(changesTable, "byId")
      .where((q) => q.eq("id", changeId(tableName, entityId)))
      .first()) as Change | undefined;
  },
});

const allChangesAfter = selector({
  name: "allChangesAfter",
  args: { after: v.pass<ClientCursor | null>() },
  handler: function* allChangesAfter({ after }) {
    if (after === null) {
      return (yield* selectFrom(changesTable, "byUpdatedAtId").order(
        "asc",
      )) as Change[];
    }
    const atClock = (yield* selectFrom(changesTable, "byUpdatedAtId")
      .where((q) => q.eq("updatedAt", after.clock).gte("id", after.changeId))
      .order("asc")) as Change[];
    const afterClock = (yield* selectFrom(changesTable, "byUpdatedAtId")
      .where((q) => q.gt("updatedAt", after.clock))
      .order("asc")) as Change[];
    return [
      ...(atClock[0]?.id === after.changeId ? atClock.slice(1) : atClock),
      ...afterClock,
    ];
  },
});

export const getChangesetAfter = selector({
  name: "getChangesetAfter",
  args: {
    after: v.pass<ClientCursor | null>(),
    registeredSyncableTableNameMap: v.record(
      v.string(),
      tableDefinitionArgSchema,
    ),
  },
  handler: function* getChangesetAfter({
    after,
    registeredSyncableTableNameMap,
  }) {
    const allChangesToSend = yield* allChangesAfter({ after });
    const changesets: ChangesetArrayType = [];
    const throughCursor = allChangesToSend.at(-1)
      ? {
          clock: allChangesToSend.at(-1)!.updatedAt,
          changeId: allChangesToSend.at(-1)!.id,
        }
      : after;

    if (allChangesToSend.length === 0) {
      return { changesets: [], throughCursor };
    }

    const groupedChanges = groupBy(allChangesToSend, (c) => c.tableName);

    for (const [tableName, changes] of Object.entries(groupedChanges)) {
      const table = registeredSyncableTableNameMap[tableName] as
        | TableDefinition
        | undefined;
      if (!table) {
        console.error("Unknown table, skipping sync for it", tableName);
        continue;
      }

      const rows: Row[] = [];
      for (const changesChunk of chunkArray(changes, SELECT_OR_CHUNK_SIZE)) {
        rows.push(
          ...(yield* selectFrom(table, "byId").where((q) =>
            changesChunk.map((c) => q.eq("id", c.entityId)),
          )),
        );
      }
      const rowsMap = new Map(rows.map((r) => [r.id, r]));

      const data = changes
        .map((c) => {
          const row = rowsMap.get(c.entityId);

          if (!row) {
            if (!isDeletedChange(c)) {
              console.error(
                "failed to find row for not deleted change, skipping sync",
                c,
              );

              return undefined;
            }

            return { change: c };
          }

          return {
            row: row as PrimitiveRow,
            change: c,
          };
        })
        .filter((c) => c != undefined);

      changesets.push({
        tableName,
        data,
      });
    }

    return { changesets, throughCursor };
  },
});

export const getLatestChangeCursor = selector({
  name: "getLatestChangeCursor",
  args: {},
  handler: function* () {
    const latest = (yield* selectFrom(changesTable, "byUpdatedAtId")
      .order("desc")
      .limit(1)) as Change[];
    return latest[0]
      ? { clock: latest[0].updatedAt, changeId: latest[0].id }
      : null;
  },
});

export const insertChangeFromInsert = action({
  name: "insertChangeFromInsert",
  args: {
    tableDef: tableDefinitionArgSchema,
    row: rowSchema,
    clientId: v.string(),
    nextClock: v.string(),
  },
  handler: function* insertChangeFromInsert({
    tableDef,
    row,
    clientId,
    nextClock,
  }) {
    const createdAt = nextClock;

    const changes: Record<string, string> = {};
    for (const col of Object.keys(row)) {
      changes[col] = createdAt;
    }

    const existing = yield* getChangeByEntityAndTableName({
      entityId: row.id,
      tableName: tableDef.tableName,
    });
    if (existing && isDeletedChange(existing)) {
      // Inserting a deleted ID restores that entity as a new incarnation.
      const restoredChange: Change = {
        ...existing,
        restoredAt: nextClock,
        updatedAt: nextClock,
        clientId,
        changes,
      };
      yield* upsert(changesTable, [restoredChange]);
      return restoredChange;
    }

    const newChange: Change = {
      id: changeId(tableDef.tableName, row.id),
      entityId: row.id,
      tableName: tableDef.tableName,
      deletedAt: null,
      clientId: clientId,
      changes,
      createdAt,
      updatedAt: createdAt,
    };

    yield* upsert(changesTable, [newChange]);

    return newChange;
  },
});

// A row can predate its change log. Every device synthesizes the same creation
// for it, so first edits on two devices merge by field instead of competing as
// rival creations, and the server receives a clock for every column.
export const UNKNOWN_CREATION_CLOCK = formatHlc({
  physical: 0,
  logical: 0,
  actorId: "unknown-creation",
});
const unknownCreation = (
  tableName: string,
  row: PrimitiveRow,
  clientId: string,
  updatedAt: string,
): Change => ({
  id: changeId(tableName, row.id),
  entityId: row.id,
  tableName,
  createdAt: UNKNOWN_CREATION_CLOCK,
  updatedAt,
  deletedAt: null,
  clientId,
  changes: Object.fromEntries(
    Object.keys(row).map((key) => [key, UNKNOWN_CREATION_CLOCK]),
  ),
});

export const insertChangeFromUpdate = action({
  name: "insertChangeFromUpdate",
  args: {
    tableDef: tableDefinitionArgSchema,
    oldRow: rowSchema,
    newRow: rowSchema,
    clientId: v.string(),
    nextClock: v.string(),
  },
  handler: function* insertChangeFromUpdate({
    tableDef,
    oldRow,
    newRow,
    clientId,
    nextClock,
  }) {
    if (oldRow.id !== newRow.id) {
      throw new Error("Cannot update row with different id");
    }

    const updatedAt = nextClock;
    const change: Change =
      (yield* getChangeByEntityAndTableName({
        entityId: oldRow.id,
        tableName: tableDef.tableName,
      })) ?? unknownCreation(tableDef.tableName, oldRow, clientId, updatedAt);
    const changedRows: Record<string, string> = { ...change.changes };

    for (const col of uniq([...Object.keys(oldRow), ...Object.keys(newRow)])) {
      if (!isEqual(oldRow[col], newRow[col])) {
        changedRows[col] = updatedAt;
      }
    }

    const newChange: Change = {
      ...change,
      changes: changedRows,
      updatedAt: updatedAt,
    };

    yield* upsert(changesTable, [newChange]);

    return newChange as Change | undefined;
  },
});

export const insertChangeFromDelete = action({
  name: "insertChangeFromDelete",
  args: {
    tableDef: tableDefinitionArgSchema,
    row: rowSchema,
    clientId: v.string(),
    nextClock: v.string(),
  },
  handler: function* insertChangeFromDelete({
    tableDef,
    row,
    clientId,
    nextClock,
  }) {
    const deletedAt = nextClock;

    const change =
      (yield* getChangeByEntityAndTableName({
        entityId: row.id,
        tableName: tableDef.tableName,
      })) ?? unknownCreation(tableDef.tableName, row, clientId, deletedAt);

    const deletedChange: Change = {
      ...change,
      deletedAt,
      updatedAt: deletedAt,
    };

    yield* upsert(changesTable, [deletedChange]);

    return deletedChange;
  },
});

/**
 * Merges must be idempotent. Reapplying the same client changes, even with a
 * newer receipt clock, must not write entity rows or Change rows again.
 * `nextClock` stamps newly converged state; it must not make a replay a change.
 */
export const mergeChanges = action({
  name: "mergeChangesAction",
  args: {
    input: changesetArrayValidator,
    nextClock: v.string(),
    clientId: v.string(),
    registeredSyncableTableNameMap: v.record(
      v.string(),
      tableDefinitionArgSchema,
    ),
  },
  handler: function* mergeChanges({
    input,
    nextClock,
    registeredSyncableTableNameMap,
  }) {
    for (const changeset of input) {
      const table = registeredSyncableTableNameMap[changeset.tableName] as
        | TableDefinition
        | undefined;
      if (!table) {
        throw new Error("Unknown table: " + changeset.tableName);
      }

      const currentChanges: Change[] = [];
      for (const dataChunk of chunkArray(
        changeset.data,
        SELECT_OR_CHUNK_SIZE,
      )) {
        currentChanges.push(
          ...((yield* selectFrom(changesTable, "byId").where((q) =>
            dataChunk.map((c) =>
              q.eq("id", changeId(changeset.tableName, c.change.entityId)),
            ),
          )) as Change[]),
        );
      }
      const currentChangesMap = new Map(
        currentChanges.map((c) => [c.entityId, c as Change]),
      );
      const originalChangesMap = new Map(currentChangesMap);

      const currentRows: Row[] = [];
      for (const dataChunk of chunkArray(
        changeset.data,
        SELECT_OR_CHUNK_SIZE,
      )) {
        currentRows.push(
          ...(yield* selectFrom(table, "byId").where((q) =>
            dataChunk.map((c) => q.eq("id", c.change.entityId)),
          )),
        );
      }
      const currentRowsMap = new Map(currentRows.map((r) => [r.id, r]));
      const originalRowsMap = new Map(currentRowsMap);
      const touchedEntityIds = new Set<string>();

      for (const {
        change: incomingChange,
        row: incomingRow,
      } of changeset.data) {
        // A live change without its row has field clocks but no values. It is
        // ignored, not rejected: rejecting would fail the sender's retries forever.
        if (incomingRow === undefined && !isDeletedChange(incomingChange)) {
          continue;
        }
        touchedEntityIds.add(incomingChange.entityId);
        const currentChanges = currentChangesMap.get(incomingChange.entityId);
        const currentRow = currentRowsMap.get(incomingChange.entityId);
        // Each restore starts a new incarnation. The newer incarnation wins
        // wholesale, so edits to an older one can never leak into it.
        const restoreOrder = compareOptionalHlc(
          incomingChange.restoredAt,
          currentChanges?.restoredAt,
        );
        const lastDeletedAt =
          currentChanges?.deletedAt == null
            ? incomingChange.deletedAt
            : incomingChange.deletedAt == null
              ? currentChanges.deletedAt
              : compareHlc(currentChanges.deletedAt, incomingChange.deletedAt) >
                  0
                ? currentChanges.deletedAt
                : incomingChange.deletedAt;
        const lastRestoredAt = maxOptionalHlc(
          currentChanges?.restoredAt,
          incomingChange.restoredAt,
        );
        const lifecycle = {
          deletedAt: lastDeletedAt,
          ...(lastRestoredAt === undefined
            ? {}
            : { restoredAt: lastRestoredAt }),
        };

        // A row without any record may be another tab's write whose record is
        // still on its way, so only an existing partial record is completed.
        const currentFieldClocks = currentChanges
          ? withUnknownClocks(currentChanges.changes, currentRow)
          : {};
        const incomingFieldClocks = withUnknownClocks(
          incomingChange.changes,
          incomingRow,
        );
        // Rival creations of one ID stamp their fields with their creation
        // clocks. Keeping every creation clock lets each merge tell those
        // defaults apart from user edits, whatever the arrival order.
        const creations = new Set([
          ...creationClocks(currentChanges),
          ...creationClocks(incomingChange),
        ]);
        if (
          Object.values(currentFieldClocks).includes(UNKNOWN_CREATION_CLOCK) ||
          Object.values(incomingFieldClocks).includes(UNKNOWN_CREATION_CLOCK)
        ) {
          creations.add(UNKNOWN_CREATION_CLOCK);
        }
        const { mergedChanges, mergedRow: incarnationRow } =
          restoreOrder > 0
            ? {
                mergedChanges: incomingFieldClocks,
                mergedRow: (incomingRow as Row | undefined) ?? {
                  id: incomingChange.entityId,
                },
              }
            : restoreOrder < 0 && currentChanges
              ? {
                  mergedChanges: currentFieldClocks,
                  mergedRow: currentRow ?? { id: incomingChange.entityId },
                }
              : lwwMerge(
                  creations,
                  currentFieldClocks,
                  incomingFieldClocks,
                  currentRow ?? { id: incomingChange.entityId },
                  incomingRow ?? { id: incomingChange.entityId },
                );
        // Docs merge only within one incarnation; a newer one replaces them.
        const mergedRow =
          restoreOrder < 0
            ? incarnationRow
            : mergeRichTextFields(
                table.tableName,
                restoreOrder > 0 ? undefined : currentRow,
                incomingRow as Row | undefined,
                incarnationRow,
              );

        const currentDeletedAt = currentChanges?.deletedAt ?? null;
        const incomingDeletedAt = incomingChange.deletedAt;
        const isDeleted = isDeletedChange(lifecycle);

        const currentClock = nextClock;
        const incomingDeleteWins =
          incomingDeletedAt != null &&
          (currentDeletedAt == null ||
            compareHlc(incomingDeletedAt, currentDeletedAt) > 0 ||
            (incomingDeletedAt === currentDeletedAt &&
              incomingChange.clientId >
                (currentChanges?.clientId ?? incomingChange.clientId)));
        const incomingStateWins =
          currentChanges === undefined ||
          !isEqual(currentChanges.changes, mergedChanges) ||
          !isEqual(currentRow, mergedRow);
        const winnerClientId =
          isDeleted && !incomingDeleteWins
            ? (currentChanges?.clientId ?? incomingChange.clientId)
            : isDeleted || incomingStateWins
              ? incomingChange.clientId
              : currentChanges.clientId;
        const [mergedCreatedAt = incomingChange.createdAt, ...rivalCreations] =
          [...creations].sort(compareHlc);

        const mergedChange: Change = {
          id: changeId(table.tableName, incomingChange.entityId),
          entityId: incomingChange.entityId,
          tableName: table.tableName,
          createdAt: mergedCreatedAt,
          ...(rivalCreations.length === 0 ? {} : { rivalCreations }),
          updatedAt: currentClock,
          ...lifecycle,
          clientId: winnerClientId,
          changes: mergedChanges,
        };
        if (
          isSameMergedState(
            currentChanges,
            currentRow,
            mergedChange,
            mergedRow,
            isDeleted,
          )
        ) {
          continue;
        }

        if (isDeleted) {
          currentRowsMap.delete(incomingChange.entityId);
        } else {
          currentRowsMap.set(incomingChange.entityId, mergedRow);
        }
        currentChangesMap.set(incomingChange.entityId, mergedChange);
      }

      const toDeleteRows: string[] = [];
      const toUpdateRows: Row[] = [];
      const toInsertRows: Row[] = [];
      const changesToUpsert: Change[] = [];
      for (const entityId of touchedEntityIds) {
        const originalRow = originalRowsMap.get(entityId);
        const finalRow = currentRowsMap.get(entityId);
        const finalChange = currentChangesMap.get(entityId);
        const changeWritten =
          finalChange !== undefined &&
          !isSameMergedState(
            originalChangesMap.get(entityId),
            originalRow,
            finalChange,
            finalRow ?? { id: entityId },
            isDeletedChange(finalChange),
          );
        if (changeWritten) changesToUpsert.push(finalChange);

        if (originalRow !== undefined && finalRow === undefined) {
          toDeleteRows.push(entityId);
        } else if (originalRow === undefined && finalRow !== undefined) {
          toInsertRows.push(finalRow);
        } else if (
          originalRow !== undefined &&
          finalRow !== undefined &&
          // A row read from storage another tab already wrote is unchanged
          // here, but subscribers still need its op alongside the new change.
          (changeWritten || !isEqual(originalRow, finalRow))
        ) {
          toUpdateRows.push(finalRow);
        }
      }

      yield* deleteRows(table, toDeleteRows);
      yield* insert(table, toInsertRows);
      yield* upsert(table, toUpdateRows);
      yield* upsert(changesTable, changesToUpsert);
    }
  },
});

const isSameMergedState = (
  currentChange: Change | undefined,
  currentRow: Row | undefined,
  mergedChange: Change,
  mergedRow: Row,
  isDeleted: boolean,
): boolean =>
  // Receipt metadata must not turn an already-converged merge into a change.
  (isDeleted ? currentRow === undefined : isEqual(currentRow, mergedRow)) &&
  currentChange !== undefined &&
  currentChange.createdAt === mergedChange.createdAt &&
  currentChange.deletedAt === mergedChange.deletedAt &&
  currentChange.restoredAt === mergedChange.restoredAt &&
  isEqual(currentChange.rivalCreations, mergedChange.rivalCreations) &&
  currentChange.clientId === mergedChange.clientId &&
  isEqual(currentChange.changes, mergedChange.changes);

// Records written before unknown creations clocked only the edited columns.
// The rest belong to the unknown creation, as unknownCreation would record them.
const withUnknownClocks = (
  fieldClocks: Record<string, string>,
  row: Row | undefined,
) => {
  const unclocked = Object.keys(row ?? {}).filter(
    (key) => !(key in fieldClocks),
  );
  return unclocked.length === 0
    ? fieldClocks
    : {
        ...fieldClocks,
        ...Object.fromEntries(
          unclocked.map((key) => [key, UNKNOWN_CREATION_CLOCK]),
        ),
      };
};

const creationClocks = (change: Change | undefined) =>
  change === undefined
    ? []
    : [change.createdAt, ...(change.rivalCreations ?? [])];

// A user edit beats a creation default whatever the clocks. Edits compare by
// the latest clock, defaults by the earliest creation. Only the shared
// unknown-creation clock can tie across devices, so the tie-break is the value.
const fieldWins = (
  creations: ReadonlySet<string>,
  a: { clock: string; value: PrimitiveValue | undefined },
  b: { clock: string; value: PrimitiveValue | undefined },
) => {
  const aIsDefault = creations.has(a.clock);
  const bIsDefault = creations.has(b.clock);
  if (aIsDefault !== bIsDefault) return bIsDefault;
  const order = compareHlc(a.clock, b.clock);
  if (order !== 0) return aIsDefault ? order < 0 : order > 0;
  return valueKey(a.value) > valueKey(b.value);
};

const valueKey = (value: PrimitiveValue | undefined) =>
  value === undefined ? "" : JSON.stringify(value);

const lwwMerge = (
  creations: ReadonlySet<string>,
  aChange: Record<string, string>,
  bChange: Record<string, string>,
  aRow: Row,
  bRow: Row,
): { mergedChanges: Record<string, string>; mergedRow: Row } => {
  const mergedChanges: Record<string, string> = {};
  const primitiveARow = aRow as PrimitiveRow;
  const primitiveBRow = bRow as PrimitiveRow;
  // Start with aRow as the base. Unchanged fields will be preserved.
  const mergedRow: PrimitiveRow = {
    ...primitiveARow,
  };

  // Get all unique keys from both change objects
  const allKeys = new Set([...Object.keys(aChange), ...Object.keys(bChange)]);

  for (const key of allKeys) {
    const changeTimestampA = aChange[key];
    const changeTimestampB = bChange[key];

    let winningTimestamp: string;
    let winningValue: string | number | boolean | null | undefined;

    if (changeTimestampA !== undefined && changeTimestampB !== undefined) {
      // --- Conflict: The key was changed in both branches ---
      if (
        fieldWins(
          creations,
          { clock: changeTimestampA, value: primitiveARow[key] },
          { clock: changeTimestampB, value: primitiveBRow[key] },
        )
      ) {
        // A is the winner
        winningTimestamp = changeTimestampA;
        winningValue = primitiveARow[key];
      } else {
        // B is the winner (or they are equal, B wins the tie)
        winningTimestamp = changeTimestampB;
        winningValue = primitiveBRow[key];
      }
    } else if (changeTimestampA !== undefined) {
      // --- Key was only changed in A ---
      winningTimestamp = changeTimestampA;
      winningValue = primitiveARow[key];
    } else {
      // --- Key was only changed in B ---
      // We can assert changeTimestampB is not undefined here.
      winningTimestamp = changeTimestampB!;
      winningValue = primitiveBRow[key];
    }

    // Update the merged results with the winning data
    mergedChanges[key] = winningTimestamp;
    // A cleared optional field is an omitted key, never an undefined value.
    if (winningValue === undefined) delete mergedRow[key];
    else mergedRow[key] = winningValue;
  }

  return { mergedChanges, mergedRow: mergedRow as Row };
};

const row = z.intersection(
  z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()]),
  ),
  z.object({
    id: z.string(),
  }),
);

export const Changeset = z.object({
  tableName: z.string(),
  data: z.array(
    z.object({
      row: row.optional(),
      change: z.object({
        id: z.string(),
        entityId: z.string(),
        tableName: z.string(),
        deletedAt: z.string().nullable(),
        restoredAt: z.string().optional(),
        rivalCreations: z.array(z.string()).optional(),
        clientId: z.string(),
        changes: z.record(z.string(), z.string()),
        createdAt: z.string(),
        updatedAt: z.string(),
      }),
    }),
  ),
});
export type ChangesetType = z.input<typeof Changeset>;
export const ChangesetArray = z.array(Changeset);
export type ChangesetArrayType = z.input<typeof ChangesetArray>;
