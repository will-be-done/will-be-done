import { describe, expect, it } from "vitest";
import {
  DB,
  SubscribableDB,
  createSelector,
  execSync,
  selectFrom,
  selectSync,
  syncDispatch,
  v,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { dbIdTrait } from "../traits";
import {
  convertMindmapNodeToTopic,
  createMindmap,
  createMindmapNode,
  updateMindmapNode,
} from "./mindmaps";
import { convertTaskToNote } from "./notes";
import { createProjectSection, createTaskInSection } from "./projectSections";
import {
  applySearchIndexOps,
  installSearchIndexHooks,
  migrateSearchIndex,
  parseSearchQuery,
  rebuildSearchIndex,
  searchHighlights,
  searchSpace,
  searchTokensOf,
  type SearchHit,
} from "./search";
import { registeredSpaceSyncableTables } from "./syncMap";
import { action } from "../builders";
import { trashTasks, updateTask } from "./tasks";
import { restoreTrashedTasks } from "./trash";
import {
  searchDocsTable,
  searchIndexTables,
  searchStatsTable,
  searchTokensTable,
  spaceMigrationsTable,
  tasksTable,
  type Task,
} from "./tables";

function createDB({ hooks = true } = {}) {
  const db = new SubscribableDB(
    new DB(new BptreeInmemDriver(), {
      traits: [dbIdTrait("space", "a0000000-0000-4000-8000-000000000001")],
    }),
  );
  execSync(
    db.loadTables([
      ...registeredSpaceSyncableTables,
      ...searchIndexTables,
      spaceMigrationsTable,
    ]),
  );
  if (hooks) installSearchIndexHooks(db);
  syncDispatch(
    db,
    createProjectSection({
      position: "append",
      sectionDraft: { id: "section", title: "Section", projectId: "project" },
    }),
  );
  return db;
}

function addTask(db: SubscribableDB, id: string, title: string, content = "") {
  return syncDispatch(
    db,
    createTaskInSection({
      projectSectionId: "section",
      position: "append",
      taskAttrs: { id, title, content },
    }),
  ) as Task;
}

const idOf = (hit: SearchHit) =>
  hit.type === "task"
    ? hit.task.id
    : hit.type === "note"
      ? hit.note.id
      : hit.node.id;

const search = (db: SubscribableDB, query: string, limit = 50) =>
  selectSync(db, { selector: searchSpace, args: { query, limit } }).map(idOf);

const tokensByDocId = createSelector()({
  name: "tokensByDocId",
  args: { docId: v.string() },
  handler: function* ({ docId }) {
    return yield* selectFrom(searchTokensTable, "byDocId").where((q) =>
      q.eq("docId", docId),
    );
  },
});

const indexedTokens = (db: SubscribableDB, docId: string) =>
  selectSync(db, { selector: tokensByDocId, args: { docId } }).map(
    (row) => row.token,
  );

const wholeIndex = createSelector()({
  name: "wholeIndex",
  args: {},
  handler: function* () {
    return {
      tokens: yield* selectFrom(searchTokensTable, "byIds"),
      docs: yield* selectFrom(searchDocsTable, "byIds"),
      stats: yield* selectFrom(searchStatsTable, "byIds"),
    };
  },
});

const highlighted = (text: string, query: string) =>
  searchHighlights(text, query)
    .map((segment) => (segment.match ? `[${segment.text}]` : segment.text))
    .join("");

describe("search tokens", () => {
  it.each([
    ["Buy MILK, then milk", ["buy", "milk", "then"]],
    ["Café naïve Ἀθῆναι", ["cafe", "naive", "αθηναι"]],
    ["Ёлка и мой дом", ["елка", "и", "мой", "дом"]],
    ["ｶﾀｶﾅ", ["かた", "たか", "かな", "な"]],
    ["カタカナ", ["かた", "たか", "かな", "な"]],
    ["東京都に行く", ["東京", "京都", "都に", "に行", "行く", "く"]],
    ["2024年 plan", ["2024", "年", "plan"]],
    ["がか", ["がか", "か"]],
    ["학교에서", ["학교", "교에", "에서", "서"]],
    ["北京烤鸭", ["北京", "京烤", "烤鸭", "鸭"]],
    ["นมสด", ["นม", "มส", "สด", "ด"]],
    ["𠮷野家", ["𠮷野", "野家", "家"]],
    ["ｶﾞｷﾞ ＡＢＣ１２", ["がぎ", "ぎ", "abc12"]],
  ])("tokenizes %j", (text, tokens) => {
    expect([...searchTokensOf(text).keys()].sort()).toEqual([...tokens].sort());
  });

  it("counts repeated tokens", () => {
    expect(Object.fromEntries(searchTokensOf("Milk, MILK and milk"))).toEqual({
      milk: 3,
      and: 1,
    });
  });

  it("splits query runs of unsegmented scripts into pairs and phrases", () => {
    const parsed = (query: string) => {
      const { terms, phrases } = parseSearchQuery(query);
      return {
        terms: terms.map((term) => term.text),
        phrases: phrases.map((phrase) => phrase.chars.join("")),
      };
    };
    expect(parsed("東京都 Cafe")).toEqual({
      terms: ["東京", "京都", "cafe"],
      phrases: ["東京都"],
    });
    expect(parsed("東")).toEqual({ terms: ["東"], phrases: [] });
    expect(parsed(" ,. ")).toEqual({ terms: [], phrases: [] });
  });
});

describe("search index", () => {
  it("follows task edits, conversions, trash and restore", () => {
    const db = createDB();
    addTask(db, "task", "Buy milk", "From the *corner* [shop](https://x.dev)");
    expect(search(db, "corn")).toEqual(["task"]);
    expect(search(db, "https")).toEqual([]);

    syncDispatch(db, updateTask({ id: "task", task: { title: "Buy bread" } }));
    expect(search(db, "milk")).toEqual([]);
    expect(search(db, "bre")).toEqual(["task"]);

    const note = syncDispatch(db, convertTaskToNote({ taskId: "task" }));
    expect(search(db, "bread")).toEqual([note!.id]);
    expect(indexedTokens(db, "task")).toEqual([]);

    addTask(db, "other", "Read book");
    syncDispatch(db, trashTasks({ ids: ["other"] }));
    expect(search(db, "book")).toEqual([]);
    syncDispatch(db, restoreTrashedTasks({ ids: ["other"] }));
    expect(search(db, "book")).toEqual(["other"]);
  });

  it("indexes topic nodes only", () => {
    const db = createDB();
    addTask(db, "task", "Launch rocket");
    syncDispatch(db, createMindmap({ id: "map", title: "Space" }));
    syncDispatch(
      db,
      createMindmapNode({
        mindmapId: "map",
        id: "topic",
        title: "Rocket fuel",
        placement: { parentId: "map", position: "last" },
      }),
    );
    syncDispatch(
      db,
      createMindmapNode({
        mindmapId: "map",
        id: "linked",
        taskId: "task",
        placement: { parentId: "map", position: "last" },
      }),
    );
    expect(search(db, "rocket").sort()).toEqual(["task", "topic"]);

    syncDispatch(
      db,
      updateMindmapNode({ id: "topic", node: { title: "Oxygen" } }),
    );
    expect(search(db, "fuel")).toEqual([]);
    expect(search(db, "oxy")).toEqual(["topic"]);

    syncDispatch(db, convertMindmapNodeToTopic({ id: "linked" }));
    expect(search(db, "launch").sort()).toEqual(["linked", "task"]);
  });

  it("keeps counts, lengths and totals equal to a rebuild", async () => {
    const db = createDB();
    addTask(db, "a", "Milk and milk", "Buy *milk* today");
    addTask(db, "b", "Bread", "東京都に行く");
    addTask(db, "c", "Eggs");
    syncDispatch(db, updateTask({ id: "a", task: { content: "No milk" } }));
    syncDispatch(db, convertTaskToNote({ taskId: "b" }));
    syncDispatch(db, trashTasks({ ids: ["c"] }));
    syncDispatch(db, createMindmap({ id: "map", title: "Plans" }));
    syncDispatch(
      db,
      createMindmapNode({
        mindmapId: "map",
        id: "linked",
        taskId: "a",
        placement: { parentId: "map", position: "last" },
      }),
    );
    syncDispatch(db, convertMindmapNodeToTopic({ id: "linked" }));

    const maintained = selectSync(db, { selector: wholeIndex, args: {} });
    // a, the note made from b, and the map's root and linked topics.
    expect(maintained.stats).toEqual([expect.objectContaining({ docs: 4 })]);
    // Batches of two, so every table spans several transactions.
    await rebuildSearchIndex(db, 2);
    expect(selectSync(db, { selector: wholeIndex, args: {} })).toEqual(
      maintained,
    );
  });

  it("builds the index for existing items once", async () => {
    const db = createDB({ hooks: false });
    addTask(db, "task", "Existing task");
    expect(search(db, "existing")).toEqual([]);

    await migrateSearchIndex(db);
    expect(search(db, "existing")).toEqual(["task"]);

    syncDispatch(db, updateTask({ id: "task", task: { title: "Changed" } }));
    await migrateSearchIndex(db);
    expect(search(db, "changed")).toEqual([]);
  });

  it("leaves another tab's merged changes to the tab that made them", () => {
    const db = createDB();
    addTask(db, "task", "Buy milk");
    syncDispatch(
      db.withTraits({ type: "cross-tab" }),
      updateTask({ id: "task", task: { title: "Buy bread" } }),
    );
    expect(search(db, "milk")).toEqual(["task"]);
    expect(search(db, "bread")).toEqual([]);
  });

  it("keeps totals exact when a change is indexed twice", () => {
    const db = createDB();
    const task = addTask(db, "task", "Buy milk", "From the corner shop");
    const before = selectSync(db, { selector: wholeIndex, args: {} });
    const reindex = action({
      name: "reindexTask",
      args: {},
      handler: function* () {
        yield* applySearchIndexOps(tasksTable, [
          { type: "insert", table: tasksTable, newValue: task },
        ]);
      },
    });
    syncDispatch(db, reindex({}));
    expect(selectSync(db, { selector: wholeIndex, args: {} })).toEqual(before);
  });
});

describe("searchSpace", () => {
  it("requires every word as a prefix and ranks title matches first", () => {
    const db = createDB();
    addTask(db, "content", "Shopping", "Buy groceries today");
    addTask(db, "title", "Groceries list", "for today");
    addTask(db, "partial", "Groceries");
    expect(search(db, "groc tod")).toEqual(["title", "content"]);
    expect(search(db, "roceries")).toEqual([]);
  });

  it.each([
    ["exact words before longer ones", "car", ["Car", "Cardigan"]],
    [
      "shorter titles first",
      "wash",
      ["Car wash", "Car wash and wax and polish"],
    ],
    ["repeated words first", "milk", ["Milk, more milk", "Milk and eggs"]],
    [
      "the rarer word weighs more",
      "alpha beta",
      ["Alpha alpha beta", "Alpha beta beta"],
    ],
  ])("ranks %s", (_name, query, titles) => {
    const db = createDB();
    for (let i = 0; i < 5; i++) addTask(db, `filler-${i}`, "Beta filler");
    // Created in reverse, so newest-first alone would give the wrong order.
    for (const title of [...titles].reverse()) addTask(db, title, title);
    expect(search(db, query)).toEqual(titles);
  });

  it("ranks todo tasks before done ones, then newest first", () => {
    const db = createDB();
    addTask(db, "done", "Report");
    syncDispatch(db, updateTask({ id: "done", task: { state: "done" } }));
    addTask(db, "weaker", "Reporting tool for the quarterly review");
    addTask(db, "older", "Report");
    addTask(db, "newer", "Report");
    syncDispatch(db, updateTask({ id: "older", task: { createdAt: 1 } }));
    expect(search(db, "report")).toEqual(["newer", "older", "weaker", "done"]);
    expect(search(db, "report", 1)).toEqual(["newer"]);
  });

  it("finds substrings of CJK text but not pairs found apart", () => {
    const db = createDB();
    addTask(db, "tokyo", "東京都に行く");
    addTask(db, "apart", "東京と京都");
    expect(search(db, "京").sort()).toEqual(["apart", "tokyo"]);
    expect(search(db, "東京都")).toEqual(["tokyo"]);
    expect(search(db, "都に行")).toEqual(["tokyo"]);
  });

  it.each([
    ["Chinese", "北京烤鸭食谱", ["烤鸭", "鸭食谱", "北"], ["京鸭", "烤面"]],
    ["Japanese kana", "ありがとうございます", ["がとう", "ござ"], ["ありご"]],
    ["half-width kana", "ｶﾞｲﾄﾞﾌﾞｯｸ", ["ガイド", "ｶﾞｲﾄﾞ", "ブック"], ["カイド"]],
    ["Korean", "서울 맛집 목록", ["맛집", "목", "서울 목록"], ["울맛"]],
    ["Thai", "ซื้อนมสด", ["นมสด", "ซื้อ"], ["นมซื้อ"]],
    ["mixed scripts", "iPhone用ケース", ["ケース", "iph 用"], ["phone"]],
    ["katakana", "カタカナ メモ", ["かたかな", "カタ", "ｶﾀｶﾅ"], ["かだ"]],
    ["hiragana", "ひらがな", ["ヒラガナ", "がな"], ["ひらか"]],
    // Queries ending mid-syllable, as a Korean IME shows them while typing.
    [
      "Korean being typed",
      "서울 맛집",
      ["ㅁ", "마", "서우", "서울 마"],
      ["마 ", "머"],
    ],
    [
      "Korean being typed as one run",
      "서울맛집",
      ["서울마", "서울맛지"],
      ["서울마 "],
    ],
    ["Korean jamo", "ㅋㅋㅋ", ["ㅋ", "ㅋㅋ"], ["카"]],
  ])("searches %s text", (_script, title, found, missed) => {
    const db = createDB();
    addTask(db, "task", title);
    for (const query of found)
      expect(search(db, query), query).toEqual(["task"]);
    for (const query of missed) expect(search(db, query), query).toEqual([]);
  });
});

describe("searchHighlights", () => {
  it.each([
    ["Groceries list", "groc", "[Groc]eries list"],
    ["Groceries", "g groc", "[Groc]eries"],
    ["Café au lait", "cafe LAIT", "[Café] au [lait]"],
    ["Café", "caf", "[Caf]é"],
    ["Cafe\u0301s", "cafe", "[Cafe\u0301]s"],
    ["Ёлка", "ел", "[Ёл]ка"],
    ["カタカナ", "かた", "[カタ]カナ"],
    ["ひらがな", "ヒラ", "[ひら]がな"],
    ["서울 맛집", "마", "서울 [맛]집"],
    ["서울맛집", "서울마", "[서울맛]집"],
    ["서울 맛집", "ㅁ", "서울 [맛]집"],
    ["東京都に行く", "京都", "東[京都]に行く"],
    ["iPhone用ケース", "ケース iph", "[iPh]one用[ケース]"],
    ["北京烤鸭食谱", "烤鸭", "北京[烤鸭]食谱"],
    ["서울 맛집", "맛", "서울 [맛]집"],
    ["ซื้อนมสด", "ซื", "[ซื้]อนมสด"],
    ["ｶﾞｲﾄﾞ", "ガイ", "[ｶﾞｲ]ﾄﾞ"],
    ["𠮷野家", "𠮷野", "[𠮷野]家"],
    ["ＡＢＣ１２３", "abc", "[ＡＢＣ]１２３"],
    ["Buy milk", "", "Buy milk"],
    ["Buy milk", "roc", "Buy milk"],
  ])("marks %j for %j", (text, query, expected) => {
    expect(highlighted(text, query)).toEqual(expected);
  });
});
