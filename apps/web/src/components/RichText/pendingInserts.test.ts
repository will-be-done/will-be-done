import { Schema } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import {
  pendingInserts,
  pendingInsertsPlugin,
  type PendingMeta,
} from "./pendingInserts";

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "text*" },
    text: {},
  },
});

const key = Symbol();

const pasted = (from: number, to: number) => {
  const state = EditorState.create({
    doc: schema.node("doc", null, [
      schema.node("paragraph", null, schema.text("Hello world")),
    ]),
    plugins: [pendingInsertsPlugin],
  });
  return state.apply(
    state.tr.setMeta(pendingInserts, {
      add: [key, { from, to }],
    } satisfies PendingMeta),
  );
};

const rangeOf = (state: EditorState) =>
  pendingInserts.getState(state)?.get(key);

describe("pending attachment inserts", () => {
  it("stay put while text is typed elsewhere", () => {
    let state = pasted(7, 7);
    state = state.apply(state.tr.insertText("Oh, ", 1));
    expect(rangeOf(state)).toEqual({ from: 11, to: 11 });

    state = state.apply(state.tr.insertText("!", state.doc.content.size - 1));
    expect(rangeOf(state)).toEqual({ from: 11, to: 11 });
  });

  it("go before text typed where they were pasted", () => {
    let state = pasted(7, 7);
    state = state.apply(state.tr.insertText("big ", 7));
    expect(rangeOf(state)).toEqual({ from: 7, to: 7 });
  });

  it("replace only the text that was selected when pasting", () => {
    let state = pasted(7, 12);
    state = state.apply(state.tr.insertText("!", 12));
    expect(rangeOf(state)).toEqual({ from: 7, to: 12 });
    state = state.apply(state.tr.delete(1, 7));
    expect(rangeOf(state)).toEqual({ from: 1, to: 6 });
  });

  it("are forgotten once inserted", () => {
    let state = pasted(7, 7);
    state = state.apply(
      state.tr.setMeta(pendingInserts, { remove: key } satisfies PendingMeta),
    );
    expect(rangeOf(state)).toBeUndefined();
  });
});
