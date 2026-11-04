import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

const MARK_DELIMITERS: Record<string, string> = {
  strike: "~~",
  bold: "**",
  italic: "*",
  code: "`",
};

type MarkRange = { from: number; to: number; delimiter: string };

const marker = (text: string) => {
  const element = document.createElement("span");
  element.className = "rich-text-marker";
  element.textContent = text;
  element.setAttribute("aria-hidden", "true");
  return element;
};

function collectActiveDecorations(state: EditorState): Decoration[] {
  const { doc, selection } = state;
  const ranges: MarkRange[] = [];
  const decorations: Decoration[] = [];

  doc.nodesBetween(selection.from, selection.to, (node, pos) => {
    if (!node.isTextblock) return true;
    if (node.type.spec.code) return false;

    const start = pos + 1;
    if (node.type.name === "heading") {
      const level = Number(node.attrs.level) || 1;
      decorations.push(
        Decoration.widget(start, marker(`${"#".repeat(level)} `), {
          side: -1,
          marks: [],
          key: `heading-${start}-${level}`,
        }),
      );
    }

    for (const [name, delimiter] of Object.entries(MARK_DELIMITERS)) {
      let open: MarkRange | null = null;
      node.forEach((child, offset) => {
        const from = start + offset;
        if (child.marks.some((mark) => mark.type.name === name)) {
          if (open) open.to = from + child.nodeSize;
          else open = { from, to: from + child.nodeSize, delimiter };
          return;
        }
        if (open) ranges.push(open);
        open = null;
      });
      if (open) ranges.push(open);
    }
    return false;
  });

  const active = ranges.filter(({ from, to }) =>
    selection.empty
      ? selection.from >= from && selection.from <= to
      : selection.from < to && selection.to > from,
  );
  // Widgets sharing a position order by side: inner marks close first, then
  // outer marks open first. Positive sides keep the caret before them.
  const byLength = [...active].sort((a, b) => a.to - a.from - (b.to - b.from));
  byLength.forEach((range, index) => {
    decorations.push(
      Decoration.widget(range.to, marker(range.delimiter), {
        side: 1 + index,
        marks: [],
        key: `close-${range.from}-${range.to}-${range.delimiter}`,
      }),
      Decoration.widget(range.from, marker(range.delimiter), {
        side: 1000 - index,
        marks: [],
        key: `open-${range.from}-${range.to}-${range.delimiter}`,
      }),
    );
  });
  return decorations;
}

type MarkersState = { focused: boolean; decorations: DecorationSet };

const markersKey = new PluginKey<MarkersState>("markdownMarkers");

const decorate = (state: EditorState) =>
  DecorationSet.create(state.doc, collectActiveDecorations(state));

const setFocused = (view: EditorView, focused: boolean) => {
  if (markersKey.getState(view.state)?.focused === focused) return false;
  view.dispatch(view.state.tr.setMeta(markersKey, focused));
  return false;
};

// Shows the markdown syntax of the styled text around the caret, so rich text
// reads like the markdown it is stored as. Only while focused: an unfocused
// editor keeps its selection.
export const MarkdownMarkers = Extension.create({
  name: "markdownMarkers",
  addProseMirrorPlugins() {
    return [
      new Plugin<MarkersState>({
        key: markersKey,
        state: {
          init: (_, state) => ({
            focused: false,
            decorations: decorate(state),
          }),
          apply: (tr, previous, _, state) => {
            const focus = tr.getMeta(markersKey) as boolean | undefined;
            return {
              focused: focus ?? previous.focused,
              decorations:
                tr.docChanged || tr.selectionSet
                  ? decorate(state)
                  : previous.decorations,
            };
          },
        },
        props: {
          decorations: (state) => {
            const markers = markersKey.getState(state);
            return markers?.focused ? markers.decorations : null;
          },
          handleDOMEvents: {
            focus: (view) => setFocused(view, true),
            blur: (view) => setFocused(view, false),
          },
        },
      }),
    ];
  },
});
