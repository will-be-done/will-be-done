import {
  asyncDispatch,
  deleteRows,
  selectAsync,
  selectFrom,
  upsert,
  v,
  type ActionGenerator,
  type HyperDB,
  type Op,
  type SelectorGenerator,
  type SubscribableDB,
  type TableDefinition,
} from "@will-be-done/hyperdb";
import { action, selector } from "../builders";
import { richTextMarkdownToPlainText } from "../common/richText";
import {
  mindmapNodesTable,
  mindmapsTable,
  notesTable,
  searchDocsTable,
  searchStatsTable,
  searchTokensTable,
  spaceMigrationsTable,
  tasksTable,
  type MindmapNode,
  type Note,
  type SearchDoc,
  type SearchDocType,
  type SearchStats,
  type SearchToken,
  type Task,
} from "./tables";

// Bump to rebuild every replica's index after changing how text is tokenized.
const searchIndexMigrationId = "search-index-v2";
const searchStatsId = "all";
const maxTokenLength = 64;
const candidateLimit = 500;
const orChunkSize = 400;
const rebuildBatchSize = 200;
// BM25F: k1 saturates repeated words, b scales length normalization, and a
// word in a title counts as much as several in a description.
const k1 = 1.2;
const b = 0.75;
const titleWeight = 3;

const wordPattern = /[\p{L}\p{M}\p{N}]+/gu;
const wordChar = /[\p{L}\p{M}\p{N}]/u;
// Scripts written without spaces between words are indexed as character
// pairs, so any substring of them can be found without a dictionary.
const unsegmentedRun =
  /([\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Hangul}\p{scx=Thai}\p{scx=Lao}\p{scx=Khmer}\p{scx=Myanmar}]+)/u;
const unsegmentedChar =
  /[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Hangul}\p{scx=Thai}\p{scx=Lao}\p{scx=Khmer}\p{scx=Myanmar}]/u;
// Only Latin and Greek accents are folded: stripping marks elsewhere would
// merge distinct letters, such as Cyrillic й into и or Japanese が into か.
const latinGreekMarks = /([\p{Script=Latin}\p{Script=Greek}])\p{Mn}+/gu;

// Katakana and hiragana spell the same sounds, so both are indexed as hiragana.
const foldKana = (text: string) =>
  text.replace(/[\u30a1-\u30f6\u30fd\u30fe]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60),
  );

const normalizeText = (text: string) =>
  foldKana(text.normalize("NFKC").toLowerCase());

type TextPart = { text: string; unsegmented: boolean };

const textParts = (text: string): TextPart[] =>
  [...normalizeText(text).matchAll(wordPattern)].flatMap(([word]) =>
    word
      .split(unsegmentedRun)
      .flatMap((part, index) =>
        part ? [{ text: part, unsegmented: index % 2 === 1 }] : [],
      ),
  );

const foldWord = (word: string) => {
  const folded = word
    .normalize("NFD")
    .replace(latinGreekMarks, "$1")
    .normalize("NFC")
    .replaceAll("ё", "е");
  return folded.length > maxTokenLength
    ? [...folded].slice(0, maxTokenLength).join("")
    : folded;
};

const characterPairs = (run: string) => {
  const chars = [...run];
  return chars.slice(0, -1).map((char, index) => char + chars[index + 1]);
};

/** Each token of the text with how often it occurs. */
export const searchTokensOf = (text: string): Map<string, number> => {
  const counts = new Map<string, number>();
  const add = (token: string) =>
    counts.set(token, (counts.get(token) ?? 0) + 1);
  for (const part of textParts(text)) {
    if (!part.unsegmented) {
      add(foldWord(part.text));
      continue;
    }
    characterPairs(part.text).forEach(add);
    // The last character starts no pair, so a one-character query still finds it.
    add([...part.text].at(-1)!);
  }
  return counts;
};

// U+FFFF never occurs in a token, so this bounds every token with the prefix.
const prefixEnd = (prefix: string) => prefix + String.fromCharCode(0xffff);

const firstHangulSyllable = 0xac00;
const lastHangulSyllable = 0xd7a3;
// NFKC turns a typed initial such as ㅁ into its conjoining form, U+1100-1112,
// which follows the order syllables are numbered in.
const firstHangulInitial = 0x1100;
const lastHangulInitial = 0x1112;

// A Korean IME shows a half-typed syllable as a bare initial (ㅁ) or a
// syllable without its final (마); either can still become any syllable in
// this inclusive range, such as 맛.
const openHangulRange = (char: string): [string, string] | undefined => {
  const code = char.charCodeAt(0);
  if (code >= firstHangulInitial && code <= lastHangulInitial) {
    const first = firstHangulSyllable + (code - firstHangulInitial) * 21 * 28;
    return [String.fromCharCode(first), String.fromCharCode(first + 587)];
  }
  if (
    code >= firstHangulSyllable &&
    code <= lastHangulSyllable &&
    (code - firstHangulSyllable) % 28 === 0
  ) {
    return [char, String.fromCharCode(code + 27)];
  }
  return undefined;
};

/** A query run of an unsegmented script whose last character may be open. */
type QueryRun = { chars: string[]; open?: [string, string] };

const runCharMatches = (run: QueryRun, index: number, char: string) =>
  char === run.chars[index] ||
  (index === run.chars.length - 1 &&
    run.open !== undefined &&
    run.open[0] <= char &&
    char <= run.open[1]);

type QueryPart = { word: string } | { run: QueryRun };

const queryParts = (query: string): QueryPart[] => {
  const parts = textParts(query);
  // Only a character at the very end can still be mid-composition.
  const endsInWord = /[\p{L}\p{M}\p{N}]$/u.test(query);
  return parts.map((part, index) => {
    if (!part.unsegmented) return { word: foldWord(part.text) };
    const chars = [...part.text];
    const open =
      endsInWord && index === parts.length - 1
        ? openHangulRange(chars.at(-1)!)
        : undefined;
    return { run: open ? { chars, open } : { chars } };
  });
};

/** A query term, matched by any token inside one of its inclusive ranges. */
export type SearchTerm = { text: string; ranges: [string, string][] };

const termOf = (text: string, open?: [string, string]): SearchTerm => {
  const chars = [...text];
  const head = chars.slice(0, -1).join("");
  const ranges: [string, string][] = [];
  if (open?.[0] !== chars.at(-1)) ranges.push([text, prefixEnd(text)]);
  if (open) ranges.push([head + open[0], prefixEnd(head + open[1])]);
  return { text, ranges };
};

// Every term must prefix a token of the item. Pairs can match apart from each
// other, so runs longer than a pair are also checked against the item's text.
export const parseSearchQuery = (query: string) => {
  const terms = new Map<string, SearchTerm>();
  const add = (term: SearchTerm) =>
    terms.set(JSON.stringify(term.ranges), term);
  const phrases: QueryRun[] = [];
  for (const part of queryParts(query)) {
    if ("word" in part) {
      add(termOf(part.word));
      continue;
    }
    const { run } = part;
    const pairs = characterPairs(run.chars.join(""));
    if (pairs.length === 0) add(termOf(run.chars[0]!, run.open));
    pairs.forEach((pair, index) =>
      add(termOf(pair, index === pairs.length - 1 ? run.open : undefined)),
    );
    if (pairs.length > 1) phrases.push(run);
  }
  return { terms: [...terms.values()], phrases };
};

const runOccursIn = (chars: string[], run: QueryRun) => {
  for (let at = 0; at + run.chars.length <= chars.length; at++) {
    if (run.chars.every((_, i) => runCharMatches(run, i, chars[at + i]!))) {
      return true;
    }
  }
  return false;
};

export type HighlightSegment = { text: string; match: boolean };

const normalizedWord = (chars: string[]) =>
  foldWord(normalizeText(chars.join("")));

// How many characters of the word spell the folded prefix, keeping accents
// with their letters.
const prefixLength = (word: string[], prefix: string) => {
  let length = 0;
  while (
    length < word.length &&
    normalizedWord(word.slice(0, length)).length < prefix.length
  ) {
    length++;
  }
  while (length < word.length && /\p{M}/u.test(word[length]!)) length++;
  return length;
};

/**
 * Splits text into runs that do or do not match the query: the part of a word
 * a query word starts it with, and the query's runs of unsegmented scripts
 * where they occur.
 */
export const searchHighlights = (
  text: string,
  query: string,
): HighlightSegment[] => {
  const parts = queryParts(query);
  const prefixes = parts.flatMap((p) => ("word" in p ? [p.word] : []));
  const runs = parts.flatMap((p) => ("run" in p ? [p.run] : []));
  const chars = [...text];
  const kindOf = (char: string) =>
    unsegmentedChar.test(char)
      ? "unsegmented"
      : wordChar.test(char)
        ? "word"
        : undefined;
  const matched = chars.map(() => false);
  const mark = (from: number, to: number) => matched.fill(true, from, to);

  for (let start = 0; start < chars.length; ) {
    const kind = kindOf(chars[start]!);
    let end = start + 1;
    while (end < chars.length && kindOf(chars[end]!) === kind) end++;

    if (kind === "word") {
      const word = chars.slice(start, end);
      const folded = normalizedWord(word);
      const longest = prefixes
        .filter((prefix) => folded.startsWith(prefix))
        .sort((a, c) => c.length - a.length)[0];
      if (longest) mark(start, start + prefixLength(word, longest));
    } else if (kind === "unsegmented") {
      // Marks stay with the character before them, so a match never splits
      // a Thai vowel off and half-width kana compose as they do in the index.
      const clusters: { from: number; to: number }[] = [];
      for (let i = start; i < end; i++) {
        const cluster = clusters.at(-1);
        if (cluster && /^\p{M}/u.test(chars[i]!.normalize("NFKC"))) {
          cluster.to = i + 1;
        } else {
          clusters.push({ from: i, to: i + 1 });
        }
      }
      const normalized = clusters.flatMap((cluster) =>
        [...normalizeText(chars.slice(cluster.from, cluster.to).join(""))].map(
          (char) => ({ char, cluster }),
        ),
      );
      for (const run of runs) {
        const length = run.chars.length;
        for (let at = 0; at + length <= normalized.length; at++) {
          if (
            run.chars.every((_, i) =>
              runCharMatches(run, i, normalized[at + i]!.char),
            )
          ) {
            mark(
              normalized[at]!.cluster.from,
              normalized[at + length - 1]!.cluster.to,
            );
          }
        }
      }
    }
    start = end;
  }

  const segments: HighlightSegment[] = [];
  chars.forEach((char, index) => {
    const last = segments.at(-1);
    if (last && last.match === matched[index]) last.text += char;
    else segments.push({ text: char, match: matched[index]! });
  });
  return segments;
};

type IndexedText = {
  docType: SearchDocType;
  id: string;
  title: string;
  content: string;
};

const indexedTextOf = (
  table: TableDefinition,
  row: object,
): IndexedText | undefined => {
  if (table === tasksTable || table === notesTable) {
    const item = row as Task | Note;
    return {
      docType: item.type,
      id: item.id,
      title: item.title,
      content: item.content ?? "",
    };
  }
  if (table === mindmapNodesTable) {
    const node = row as MindmapNode;
    // A task or note node shows its item, which is indexed on its own.
    if (node.taskId || node.noteId) return undefined;
    return { docType: node.type, id: node.id, title: node.title, content: "" };
  }
  return undefined;
};

const plainTextOf = (text: Pick<IndexedText, "title" | "content">) => ({
  title: richTextMarkdownToPlainText(text.title, "title"),
  content: text.content
    ? richTextMarkdownToPlainText(text.content, "content")
    : "",
});

const sumOf = (counts: Map<string, number>) =>
  [...counts.values()].reduce((sum, count) => sum + count, 0);

const indexOf = (text: IndexedText) => {
  const plain = plainTextOf(text);
  const title = searchTokensOf(plain.title);
  const content = searchTokensOf(plain.content);
  const tokens: SearchToken[] = [
    ...new Set([...title.keys(), ...content.keys()]),
  ].map((token) => ({
    id: `${text.id}:${token}`,
    token,
    docId: text.id,
    titleCount: title.get(token) ?? 0,
    contentCount: content.get(token) ?? 0,
  }));
  const doc: SearchDoc = {
    id: text.id,
    docType: text.docType,
    titleLength: sumOf(title),
    contentLength: sumOf(content),
  };
  return { tokens, doc };
};

const sameText = (a: IndexedText | undefined, b: IndexedText | undefined) =>
  a?.docType === b?.docType &&
  a?.title === b?.title &&
  a?.content === b?.content;

const emptyStats: SearchStats = {
  id: searchStatsId,
  docs: 0,
  titleLength: 0,
  contentLength: 0,
};

/** Updates the search index for writes made without the index hook. */
export function* applySearchIndexOps(
  table: TableDefinition,
  ops: readonly Op[],
): ActionGenerator<void> {
  const changes = ops.flatMap((op) => {
    const oldText =
      op.type !== "insert" && op.oldValue
        ? indexedTextOf(table, op.oldValue)
        : undefined;
    const newText =
      op.type !== "delete" ? indexedTextOf(table, op.newValue) : undefined;
    return sameText(oldText, newText) ? [] : [{ oldText, newText }];
  });
  if (changes.length === 0) return;

  // Totals move by the difference from the stored doc rows, not from the
  // old text, so applying a change twice or to an unindexed item stays exact.
  const ids = [
    ...new Set(changes.map(({ oldText, newText }) => (newText ?? oldText)!.id)),
  ];
  const storedDocs = new Map(
    (yield* selectFrom(searchDocsTable, "byId").where((q) =>
      ids.map((id) => q.eq("id", id)),
    )).map((doc) => [doc.id, doc]),
  );

  const tokenUpserts = new Map<string, SearchToken>();
  const tokenDeletes = new Set<string>();
  const docUpserts = new Map<string, SearchDoc>();
  const docDeletes = new Set<string>();
  const delta = { docs: 0, titleLength: 0, contentLength: 0 };

  for (const { oldText, newText } of changes) {
    const oldIndex = oldText && indexOf(oldText);
    const newIndex = newText && indexOf(newText);
    const oldTokens = new Map(
      (oldIndex?.tokens ?? []).map((row) => [row.id, row]),
    );
    for (const row of newIndex?.tokens ?? []) {
      const old = oldTokens.get(row.id);
      oldTokens.delete(row.id);
      tokenDeletes.delete(row.id);
      if (
        old?.titleCount !== row.titleCount ||
        old.contentCount !== row.contentCount
      ) {
        tokenUpserts.set(row.id, row);
      }
    }
    for (const id of oldTokens.keys()) {
      tokenUpserts.delete(id);
      tokenDeletes.add(id);
    }

    const id = (newText ?? oldText)!.id;
    const stored = storedDocs.get(id);
    const doc = newIndex?.doc;
    for (const [counted, sign] of [
      [stored, -1],
      [doc, 1],
    ] as const) {
      if (!counted) continue;
      delta.docs += sign;
      delta.titleLength += sign * counted.titleLength;
      delta.contentLength += sign * counted.contentLength;
    }
    if (doc) {
      storedDocs.set(id, doc);
      docUpserts.set(id, doc);
      docDeletes.delete(id);
    } else {
      storedDocs.delete(id);
      docUpserts.delete(id);
      if (stored) docDeletes.add(id);
    }
  }

  if (tokenDeletes.size > 0) {
    yield* deleteRows(searchTokensTable, [...tokenDeletes]);
  }
  if (tokenUpserts.size > 0) {
    yield* upsert(searchTokensTable, [...tokenUpserts.values()]);
  }
  if (docDeletes.size > 0) yield* deleteRows(searchDocsTable, [...docDeletes]);
  if (docUpserts.size > 0)
    yield* upsert(searchDocsTable, [...docUpserts.values()]);
  if (Object.values(delta).every((value) => value === 0)) return;

  const stats = yield* selectFrom(searchStatsTable, "byId")
    .where((q) => q.eq("id", searchStatsId))
    .firstOr(emptyStats);
  yield* upsert(searchStatsTable, [
    {
      id: searchStatsId,
      docs: Math.max(0, stats.docs + delta.docs),
      titleLength: Math.max(0, stats.titleLength + delta.titleLength),
      contentLength: Math.max(0, stats.contentLength + delta.contentLength),
    },
  ]);
}

export function installSearchIndexHooks(db: SubscribableDB) {
  db.afterChange(function* updateSearchIndex(_db, table, traits, ops) {
    if (
      table !== tasksTable &&
      table !== notesTable &&
      table !== mindmapNodesTable
    ) {
      return;
    }
    // The tab that made the change already wrote its index rows, in the same
    // transaction, to the storage all tabs share.
    if (traits.some((trait) => trait.type === "cross-tab")) return;
    yield* applySearchIndexOps(table, ops);
  });
}

/** Deletes a batch of index rows; true once the index is empty. */
export const clearSearchIndexBatch = action({
  name: "clearSearchIndexBatch",
  args: { limit: v.number() },
  handler: function* clearSearchIndexBatch({
    limit,
  }): ActionGenerator<boolean> {
    for (const table of [
      searchTokensTable,
      searchDocsTable,
      searchStatsTable,
    ]) {
      const rows = yield* selectFrom(table, "byIds").limit(limit);
      if (rows.length > 0) {
        yield* deleteRows(
          table,
          rows.map((row) => row.id),
        );
        return false;
      }
    }
    return true;
  },
});

/** Indexes the next batch of items by id; null once the table is done. */
export const indexSearchBatch = action({
  name: "indexSearchBatch",
  args: {
    docType: v.union(
      v.literal("task"),
      v.literal("note"),
      v.literal("mindmapNode"),
    ),
    afterId: v.string(),
    limit: v.number(),
  },
  handler: function* indexSearchBatch({
    docType,
    afterId,
    limit,
  }): ActionGenerator<string | null> {
    const [table, rows] =
      docType === "task"
        ? ([
            tasksTable,
            yield* selectFrom(tasksTable, "byIds")
              .where((q) => q.gt("id", afterId))
              .limit(limit),
          ] as const)
        : docType === "note"
          ? ([
              notesTable,
              yield* selectFrom(notesTable, "byIds")
                .where((q) => q.gt("id", afterId))
                .limit(limit),
            ] as const)
          : ([
              mindmapNodesTable,
              yield* selectFrom(mindmapNodesTable, "byIds")
                .where((q) => q.gt("id", afterId))
                .limit(limit),
            ] as const);
    yield* applySearchIndexOps(
      table,
      rows.map((row) => ({ type: "insert", table, newValue: row }) as Op),
    );
    return rows.length < limit ? null : rows.at(-1)!.id;
  },
});

/**
 * Rebuilds the whole index in batches, each its own transaction, so neither
 * the old index nor the new one is ever held in memory at once.
 */
export async function rebuildSearchIndex(
  db: HyperDB,
  batchSize = rebuildBatchSize,
) {
  let cleared = false;
  while (!cleared) {
    cleared = await asyncDispatch(
      db,
      clearSearchIndexBatch({ limit: batchSize }),
    );
  }
  for (const docType of ["task", "note", "mindmapNode"] as const) {
    let afterId: string | null = "";
    while (afterId !== null) {
      afterId = await asyncDispatch(
        db,
        indexSearchBatch({ docType, afterId, limit: batchSize }),
      );
    }
  }
}

const searchIndexMigration = selector({
  name: "searchIndexMigration",
  args: {},
  handler: function* searchIndexMigration() {
    return yield* selectFrom(spaceMigrationsTable, "byId")
      .where((q) => q.eq("id", searchIndexMigrationId))
      .firstOr(null);
  },
});

const markSearchIndexMigrated = action({
  name: "markSearchIndexMigrated",
  args: {},
  handler: function* markSearchIndexMigrated(): ActionGenerator<void> {
    yield* upsert(spaceMigrationsTable, [
      { id: searchIndexMigrationId, appliedAt: Date.now() },
    ]);
  },
});

/** Builds the index for existing items once per tokenizer version. */
export async function migrateSearchIndex(db: HyperDB) {
  if (await selectAsync(db, { selector: searchIndexMigration, args: {} })) {
    return;
  }
  await rebuildSearchIndex(db);
  await asyncDispatch(db, markSearchIndexMigrated({}));
}

export type SearchHit =
  | { type: "task"; task: Task }
  | { type: "note"; note: Note }
  | { type: "mindmapNode"; node: MindmapNode };

const chunks = <T>(items: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );

const rowsByDoc = (rows: SearchToken[]) => {
  const byDoc = new Map<string, SearchToken[]>();
  for (const row of rows) {
    const docRows = byDoc.get(row.docId);
    if (docRows) docRows.push(row);
    else byDoc.set(row.docId, [row]);
  }
  return byDoc;
};

// A longer word only starting with the term counts as part of a match, so
// "car" ranks "car" above "cardigan".
const prefixWeight = (term: string, token: string) =>
  [...term].length / [...token].length;

/**
 * Tasks, notes and mindmap topics containing every word of the query as a
 * word prefix, ranked by BM25F. Matches of the longest word are capped, so a
 * very common prefix returns an incomplete set and approximate frequencies.
 */
export const searchSpace = selector({
  name: "searchSpace",
  args: { query: v.string(), limit: v.number() },
  handler: function* searchSpace({
    query,
    limit,
  }): SelectorGenerator<SearchHit[]> {
    const { terms, phrases } = parseSearchQuery(query);
    if (terms.length === 0 || limit <= 0) return [];

    const scanTerm = (term: SearchTerm) =>
      selectFrom(searchTokensTable, "byToken")
        .where((q) =>
          term.ranges.map(([from, to]) =>
            q.gte("token", from).lte("token", to),
          ),
        )
        .limit(candidateLimit);

    // The longest term is likely the rarest, so it picks the candidates.
    const [first, ...rest] = [...terms].sort(
      (a, c) => c.text.length - a.text.length,
    );
    const firstMatches = rowsByDoc(yield* scanTerm(first!));
    const matchesByTerm = new Map([[first!, firstMatches]]);
    const docFrequency = new Map([[first!, firstMatches.size]]);
    let candidateIds = [...firstMatches.keys()];

    for (const term of rest) {
      if (candidateIds.length === 0) break;
      const rows: SearchToken[] = [];
      const chunkSize = Math.floor(orChunkSize / term.ranges.length);
      for (const ids of chunks(candidateIds, chunkSize)) {
        rows.push(
          ...(yield* selectFrom(searchTokensTable, "byDocId").where((q) =>
            ids.flatMap((id) =>
              term.ranges.map(([from, to]) =>
                q.eq("docId", id).gte("token", from).lte("token", to),
              ),
            ),
          )),
        );
      }
      const matches = rowsByDoc(rows);
      candidateIds = candidateIds.filter((id) => matches.has(id));
      matchesByTerm.set(term, matches);
      docFrequency.set(term, rowsByDoc(yield* scanTerm(term)).size);
    }
    if (candidateIds.length === 0) return [];

    const docs = (yield* selectFrom(searchDocsTable, "byId").where((q) =>
      candidateIds.map((id) => q.eq("id", id)),
    )) as SearchDoc[];
    const stats = yield* selectFrom(searchStatsTable, "byId")
      .where((q) => q.eq("id", searchStatsId))
      .firstOr(emptyStats);
    const docCount = Math.max(stats.docs, docs.length);
    const averageTitle = stats.titleLength / docCount || 1;
    const averageContent = stats.contentLength / docCount || 1;

    const scoreOf = (doc: SearchDoc) => {
      const titleNorm = 1 - b + (b * doc.titleLength) / averageTitle;
      const contentNorm = 1 - b + (b * doc.contentLength) / averageContent;
      let score = 0;
      for (const [term, matches] of matchesByTerm) {
        let frequency = 0;
        for (const row of matches.get(doc.id) ?? []) {
          frequency +=
            prefixWeight(term.text, row.token) *
            ((titleWeight * row.titleCount) / titleNorm +
              row.contentCount / contentNorm);
        }
        const df = docFrequency.get(term) ?? 1;
        const idf = Math.log(1 + (docCount - df + 0.5) / (df + 0.5));
        score += (idf * frequency * (k1 + 1)) / (k1 + frequency);
      }
      return score;
    };
    const scores = new Map(docs.map((doc) => [doc.id, scoreOf(doc)]));

    const idsOf = (docType: SearchDocType) =>
      docs.flatMap((doc) => (doc.docType === docType ? [doc.id] : []));
    const taskIds = idsOf("task");
    const noteIds = idsOf("note");
    const nodeIds = idsOf("mindmapNode");
    const tasks =
      taskIds.length > 0
        ? yield* selectFrom(tasksTable, "byId").where((q) =>
            taskIds.map((id) => q.eq("id", id)),
          )
        : [];
    const notes =
      noteIds.length > 0
        ? yield* selectFrom(notesTable, "byId").where((q) =>
            noteIds.map((id) => q.eq("id", id)),
          )
        : [];
    const nodes =
      nodeIds.length > 0
        ? yield* selectFrom(mindmapNodesTable, "byId").where((q) =>
            nodeIds.map((id) => q.eq("id", id)),
          )
        : [];
    const mindmapIds = [...new Set(nodes.map((node) => node.mindmapId))];
    const mindmapIdSet = new Set(
      (mindmapIds.length > 0
        ? yield* selectFrom(mindmapsTable, "byId").where((q) =>
            mindmapIds.map((id) => q.eq("id", id)),
          )
        : []
      ).map((mindmap) => mindmap.id),
    );

    const containsPhrases = (text: Pick<IndexedText, "title" | "content">) => {
      if (phrases.length === 0) return true;
      const plain = plainTextOf(text);
      const chars = [...normalizeText(`${plain.title}\n${plain.content}`)];
      return phrases.every((phrase) => runOccursIn(chars, phrase));
    };

    const ranked = [
      ...tasks.map((task) => ({
        id: task.id,
        hit: { type: "task", task } as const,
        text: { title: task.title, content: task.content ?? "" },
        done: task.state === "done",
        createdAt: task.createdAt,
      })),
      ...notes.map((note) => ({
        id: note.id,
        hit: { type: "note", note } as const,
        text: { title: note.title, content: note.content ?? "" },
        done: false,
        createdAt: note.createdAt,
      })),
      ...nodes
        .filter((node) => mindmapIdSet.has(node.mindmapId))
        .map((node) => ({
          id: node.id,
          hit: { type: "mindmapNode", node } as const,
          text: { title: node.title, content: "" },
          done: false,
          createdAt: node.createdAt,
        })),
    ].filter((entry) => containsPhrases(entry.text));

    return ranked
      .sort(
        (a, c) =>
          Number(a.done) - Number(c.done) ||
          (scores.get(c.id) ?? 0) - (scores.get(a.id) ?? 0) ||
          c.createdAt - a.createdAt,
      )
      .slice(0, limit)
      .map((entry) => entry.hit);
  },
});
