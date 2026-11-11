# Search Design and Invariants

Global search finds Tasks, Notes, and mindmap topics by title and description,
offline, on every replica. This document records why it is built the way it
is and what must stay true when changing it. Update it in the same change when
the index, tokenizer, ranking, or result-opening behavior changes.

Code lives in:

- `apps/slices/src/space/search.ts`: tokenizer, index maintenance, the
  `searchSpace` selector, and `searchHighlights`;
- `apps/slices/src/space/tables.ts`: `searchTokensTable`, `searchDocsTable`,
  `searchStatsTable` (`searchIndexTables`);
- `apps/web/src/components/Search/`: the `/` dialog;
- `apps/api/src/http/v1/search.ts`, `apps/api/src/services/search.ts`:
  `GET /spaces/:spaceId/search`.

## Why a hand-built index

The same slices run in the browser (`HybridDB` over wa-sqlite or IndexedDB) and on the server (local SQLite, Turso Cloud, `tursod`). SQLite
FTS5 is not available behind every driver, cannot run on IndexedDB, and would
sit outside HyperDB's transactions and selector reactivity. So the index is
ordinary HyperDB tables: a prefix query is a B-tree range scan, results are
reactive like any selector, and it works offline with no server.

The cost is that tokenizing and ranking are ours to maintain, and the index
takes roughly one row per distinct word per item.

## The index is derived, per replica

- `search_tokens`: one row per (item, token) with its count in the title and
  in the content. `byToken` [token, docId] finds items by token prefix;
  `byDocId` [docId, token] checks one item's tokens.
- `search_docs`: one row per indexed item with its title and content lengths
  in tokens, for BM25 length normalization.
- `search_stats`: one row (`id: "all"`) with the item count and length totals,
  for averages and IDF.

These tables are **not syncable** and must never be registered in the sync
map. Each replica (every browser DB, every server space DB) builds its own
from its synced source rows. Syncing them would ship derived data, double the
change log, and conflict on the shared stats row.

The index is maintained by `installSearchIndexHooks`, an `afterChange` hook
on `tasks`, `notes`, and `mindmap_nodes` that runs inside the writing
transaction. Every write that goes through a DB with hooks keeps the index
current: actions, incoming sync, backup restore, undo. The hook diffs old and
new indexed text and skips writes that do not change it (most writes: order,
state, dates).

The stats row moves by the difference between the new doc row and the
**stored** one, not the old text. Applying a change twice, or to an item the
index never saw, therefore leaves the totals exact.

### Never in memory

The index grows with every word of every item, so the browser never holds it.
The web runtime lists `searchIndexTables` in HybridDB's `uncachedTables`
(`apps/web/src/store/configs.ts`): their rows never enter the in-memory cache,
every read goes to IndexedDB or wa-sqlite, and writes persist in the same batch
as the item that caused them. The search reads are all bounded (see Query), so
a keystroke costs a handful of storage queries. The server's space DBs have no
cache and need nothing.

Do not preload these tables, read them with an unbounded scan, or move the
web runtime to a cache that keeps them.

### Other tabs

Tabs share one storage. A tab's change lands in storage together with its
index rows, and only then reaches the other tabs. The other tabs merge it with
the `cross-tab` trait, and the hook skips those merges: the index is already
right, and re-deriving it from the receiving tab's in-memory rows would be
redundant writes at best. A search open in the receiving tab does not re-run
for such a change until its query changes.

### Rebuilds

`migrateSearchIndex` rebuilds the index once per `searchIndexMigrationId`, at
DB startup (web `configs.ts`, API `db.ts`). `rebuildSearchIndex` clears and
refills it in batches of 200 rows, each its own transaction, so neither index
is ever held whole. A rebuild cut short starts over on the next start, because
the migration is recorded only after it finishes. An edit made while a rebuild
runs can skew the totals slightly; they only affect ranking.

Invariants:

1. A DB that writes Tasks, Notes, or mindmap nodes without the hooks
   installed must call `applySearchIndexOps` itself. The browser popup
   (`apps/web/src/store/popupStore.ts`) is such a DB.
2. Changing what text is indexed or how it is tokenized requires bumping
   `searchIndexMigrationId`. Replicas only rebuild when they see a new id; an
   old index silently misses or mis-scores items otherwise.
3. `rebuildSearchIndex` must produce exactly what the hooks maintain. The
   "keeps counts, lengths and totals equal to a rebuild" test enforces it.

## What is indexed

- Tasks and Notes: title and content (`content` is the description).
- Mindmap nodes only when they are topics (no `taskId`/`noteId`). A Task or
  Note node shows its item, which is already indexed; indexing both would
  duplicate the result. Converting a node to a topic indexes it.
- Text goes through `richTextMarkdownToPlainText` first, so markdown syntax
  and link URLs are not searchable, only the visible text.

Not indexed: TaskTemplates, trashed Tasks (they leave `tasks`), Projects,
ProjectSections, checklist items, ExternalEvents. Results for topics whose
mindmap row is missing are dropped at query time.

## Tokenizer

`searchTokensOf` and `parseSearchQuery` must apply identical rules, or a
query can never equal a token.

1. NFKC, then lowercase. NFKC folds full-width Latin (`ＡＢＣ` → `abc`) and
   half-width katakana (`ｶﾞ` → `ガ`). Katakana is then folded to hiragana
   (`カタカナ` = `かたかな`); `normalizeText` does all three.
2. Words are runs of `[\p{L}\p{M}\p{N}]`. Everything else separates.
3. Latin and Greek combining marks are stripped (`café` = `cafe`), and `ё` is
   folded to `е`. Marks are **not** stripped elsewhere: that would merge
   distinct letters such as Cyrillic `й`/`и` or Japanese `が`/`か`.
4. Runs in scripts written without spaces (Han, Hiragana, Katakana, Hangul,
   Thai, Lao, Khmer, Myanmar, by `scx`) become overlapping character pairs
   plus the last character alone: `東京都` → `東京`, `京都`, `都`. With
   prefix matching, every single character and every substring is then
   findable without a dictionary. Hangul is included although Korean uses
   spaces, because particles attach to words (`학교에서`).
5. Tokens are capped at 64 code points.

Characters are code points (`[...string]`), never UTF-16 units, so Han
characters outside the BMP (`𠮷`) work.

## Query

- Every query word must be a prefix of some token of the item (AND).
  `gro list` finds "Grocery list"; `roceries` finds nothing.
- An unsegmented query run becomes its pairs as terms. Pairs can match in
  different places (`東京と京都` has both `東京` and `京都`), so a run longer
  than two characters is also a _phrase_: it must occur as a substring of the
  item's normalized plain text. That check runs only on the final candidates.
- The longest term picks candidates through `byToken`, capped at 500 token
  rows. Remaining terms are checked only against those candidates through
  `byDocId` ranges, in OR chunks of 400. Reads stay bounded by the cap, not
  the space size.

- A query ending in a Korean syllable that an IME may still be composing
  matches every syllable it can become: a bare initial `ㅁ` matches `마`
  through `밓`, and `마` matches `마` through `맣`, so `서울 마` finds
  "서울 맛집" while typing. A term holds inclusive token ranges for this. NFKC
  turns a typed `ㅁ` (U+3141) into the conjoining initial U+1106, which is
  what the range code sees. A trailing space closes the syllable.

Consequence: a query whose longest term is very common (one Latin letter, a
common Han character) returns an incomplete candidate set, and its document
frequencies are capped. This is accepted for interactive search; typing one
more character fixes it.

A prefix range is `gte(term).lte(term + U+FFFF)`. U+FFFF never appears in a
token and sorts after every UTF-16 unit HyperDB compares, so the bound is
exact.

## Ranking

BM25F over the two fields: k1 = 1.2, b = 0.75, a title match weighs 3× a
content match. Two adjustments:

- A prefix match counts partially, weighted by term length / token length,
  so `car` ranks "Car" above "Cardigan".
- IDF uses `search_stats.docs` and the document frequency seen in the
  bounded scans (approximate when capped, see above).

Done Tasks always come after everything else, even a weaker todo match: they
are rarely what you are looking for. Within each group, ties go to the
newest.

## Highlighting

`searchHighlights` bolds only the matched part, not whole words:

- Latin-like words: the longest query prefix the word starts with, mapped
  back to original characters (accents and combining marks stay with their
  letter: `[Caf]é`, `[Ёл]ка`).
- Unsegmented runs: every occurrence of each query run. Marks join the
  preceding character before comparing, so a Thai vowel never splits from
  its consonant, and half-width kana compose as in the index (`[ｶﾞｲ]ﾄﾞ` for
  `ガイ`).

It must follow the tokenizer's folding rules. If the tokenizer starts
folding something new, highlighting has to fold it too, or results appear
without bold text.

Only titles are highlighted; there is no content snippet yet.

## Opening a result

- Task or Note: the dialog opens its page (`/tasks/:id`, `/notes/:id`), never
  its place in a project. A done Task can be buried behind "Show More" in a
  long section, so a page always shows it; see
  `apps/web/src/components/ItemPage/`.
- Topic: it navigates to its mindmap with `itemId` set to the node ID
  (omitted for the central topic). The map clears `itemId` from the URL once
  it has focused the node, so do not assert on the URL after arrival.

## Known limitations

- No simplified/traditional Chinese folding (`东京` does not find `東京`).
- No stemming or typo tolerance in any language: `run` finds "running" but
  not "ran".
- Korean IME composition is covered only for a bare initial or a syllable
  without a final. A final that moves to the next syllable (`성` on the way to
  `서울`) or a vowel still combining (`고` on the way to `과`) matches nothing
  for that one keystroke.
- Short CJK or Thai queries match broadly: `京` finds `北京` and `東京`
  alike.

## Tests

- `apps/slices/src/space/search.test.ts`: tokenizer table, index follows
  edits/conversions/trash, rebuild equals maintained index, migration,
  ranking cases, multilingual search and highlight tables. Add rows there
  first.
- `apps/api/src/e2e/search.test.ts`: the v1 endpoint end to end.
- `apps/web/e2e/search.spec.ts`: dialog, highlighting, opening a Task or
  Note on its page, jumping to a topic, finding a task created in another
  tab. Running the web E2E server also needs
  `radicale` on `PATH`.
- HyperDB's `hybrid-db.test.ts` covers `uncachedTables` itself.
