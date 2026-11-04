import { Extension } from "@tiptap/core";
import { Fragment, Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import {
  markdownToRichTextNodes,
  type RichTextKind,
  type RichTextNode,
} from "@will-be-done/slices/common";

const BARE_URL = /^\s*\S+:\/\/\S+\s*$/;

// Pasted lines stay lines, as they were in the source.
const keepLines = (nodes: RichTextNode[]): RichTextNode[] =>
  nodes.flatMap((node) => {
    if (node.type === "codeBlock") return [node];
    if (node.content) return [{ ...node, content: keepLines(node.content) }];
    if (!node.text?.includes("\n")) return [node];
    return node.text
      .split("\n")
      .flatMap((line, index) => [
        ...(index > 0 ? [{ type: "hardBreak" }] : []),
        ...(line ? [{ ...node, text: line }] : []),
      ]);
  });

// Pastes plain text as markdown, the format the text is stored in.
export const MarkdownPaste = Extension.create<{ kind: RichTextKind }>({
  name: "markdownPaste",
  addOptions() {
    return { kind: "content" };
  },
  addProseMirrorPlugins() {
    const { kind } = this.options;
    return [
      new Plugin({
        key: new PluginKey("markdownPaste"),
        props: {
          handlePaste: (view, event) => {
            const data = event.clipboardData;
            const text = data?.getData("text/plain");
            if (!data || !text) return false;
            // Rich HTML pastes as it is, except from code editors, which
            // wrap plain source in styled HTML.
            if (
              data.getData("text/html") &&
              !data.types.includes("vscode-editor-data")
            ) {
              return false;
            }
            // A lone URL is left to the link extension, which links a
            // selection with it.
            if (BARE_URL.test(text)) return false;
            if (view.state.selection.$from.parent.type.spec.code) return false;

            const nodes = keepLines(markdownToRichTextNodes(text, kind));
            let content: Fragment;
            try {
              content = view.state.schema.nodeFromJSON({
                type: "doc",
                content: nodes,
              }).content;
            } catch {
              return false;
            }
            // Open paragraph edges merge into the paragraph at the caret.
            const slice = new Slice(
              content,
              content.firstChild?.type.name === "paragraph" ? 1 : 0,
              content.lastChild?.type.name === "paragraph" ? 1 : 0,
            );
            view.dispatch(
              view.state.tr
                .replaceSelection(slice)
                .scrollIntoView()
                .setMeta("paste", true)
                .setMeta("uiEvent", "paste"),
            );
            return true;
          },
        },
      }),
    ];
  },
});
