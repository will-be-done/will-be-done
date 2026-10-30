# Rich Text Fields

Task and template titles, descriptions, and checklist items are Markdown
editors whose concurrent edits merge. This document covers why they are built
the way they are and the traps around them. The merge invariant itself is part
of the sync rules in [sync.md](sync.md#merge-rules); follow that
document for any change to how these fields merge.

## Storage: a doc and its text

Each rich text field is stored twice on the row: a base64 Yjs document
(`titleDoc`, `contentDoc`) and its Markdown rendering (`title`, `content`).

- **The doc is the source of truth once it exists.** The text is always
  re-derived from it, on every write and every merge. Never write a text field
  and a doc field that disagree.
- **The text exists for everything that does not edit.** Lists, the v1 API,
  imports, exports, and older clients all read Markdown. Keeping it avoided a
  sync protocol bump: clients without doc support keep working.
- **Docs are created lazily.** A row without a doc gets one seeded from its
  text the first time an editor or a text write touches it, so existing local
  databases need no migration.

The conversion lives in `apps/slices` (`common/richText.ts`) because the server
and the API need it without a browser or Tiptap. Its Yjs layout (the `default`
fragment, node and mark names) must match what Tiptap's Collaboration
extension writes; a mismatch shows up as text the editor cannot see, not as an
error.

## Merging

Rich text fields are registered with `registerRichTextFields` in
`space/tables.ts`. `mergeChanges` unions the two docs instead of picking a
last-writer-wins value, then re-derives the text. Two traps make this harder
than calling `Y.mergeUpdates`:

- **Seeds must be identical across replicas.** Two devices that seed a doc from
  the same Markdown must produce byte-identical Yjs structs. With a random
  client ID, merging the two seeds repeats the text. `seedRichTextDoc` derives
  the client ID from the content, and `SEED_VERSION` must be bumped whenever
  seed output for the same Markdown changes, so old and new seeds do not
  collide.
- **Merges must converge on bytes, not just content.** Replicas compare rows
  to decide whether anything changed, so `mergeRichTextDocs` keeps one side's
  exact bytes when it already contains the other and picks one encoding for
  equal states. Otherwise replays write rows and echo changes forever.
- **Generated edits must be deterministic too.** `replaceRichTextDocMarkdown`
  derives its client ID from its input, so the same text write replayed on the
  server produces the same structs instead of a second copy of the edit.
- **One malformed doc must not stall sync.** If a doc fails to decode, the
  merge keeps the current doc for that field and carries on.

Every doc save is merged into the stored doc rather than replacing it, since an
editor can save before a synced edit reaches it.

### Text-only writes

A write that sets only the Markdown text (the v1 API, `updateTask` with a
title) goes through `syncItemRichText` / `syncChecklistItemRichText`
(`space/richTextItems.ts`). It edits the doc rather than replacing it:
`replaceRichTextDocMarkdown` diffs top-level blocks and leaves unchanged ones
alone. A changed text block that keeps its type (a title, a checklist item, a
paragraph, a heading) is edited in place: only the characters that differ are
deleted and inserted, then marks are reformatted. So a title renamed through
the API merges with someone typing in it, just like two editors. When paragraphs
are added, removed, or change type, everything from the first to the last
changed block is replaced, and concurrent typing inside that range is lost.

Clients that predate docs still sync on the same protocol version. They change
only the text, keeping the doc they received (or none). `mergeChanges` spots a
side whose text won LWW but disagrees with its own doc and replays that text as
an edit of the doc it was written against, falling back to the other side's doc
when it has none. With the stale doc as the base, the old client's edit merges
with concurrent ones; without it, the edit applies like a last-writer-wins
write over the changed range.

## Markdown round trip

Text must survive doc → Markdown → doc unchanged, or every save rewrites the
field and fights concurrent edits. Things that would otherwise drift:

- **Kinds.** `title` (titles and checklist items) is one inline line: block
  syntax such as `# 1` or `1.` stays literal, and line breaks become spaces.
  `content` (descriptions) supports blocks.
- **Blank lines.** Markdown has no empty paragraphs, so extra blank lines
  between blocks are stored as empty paragraphs and written back as blank
  lines. Without this, whitespace collapsed when editing ended.
- **Link definitions** (`[1]: https://...`) stay literal text: there is no
  editor node for them, so parsing them would drop the line.
- **Code spans carry no other marks.** Tiptap's code mark excludes all others,
  so a link around a code span keeps the code and loses the link.
- **Bare `www.` links** parse to `https://` hrefs and are written back bare.
- **Emphasis edges.** Whitespace inside `**` is moved outside, since Markdown
  cannot open or close emphasis on whitespace.

## Editor

`apps/web/src/components/RichText/RichTextEditor.tsx` wraps Tiptap with a
private `Y.Doc` per mounted editor.

- **Saving.** Local doc updates save after a short debounce and flush on blur,
  unmount, and when the page is hidden (`pendingDraftFlushes`). Stored docs
  arriving from sync are applied with a dedicated origin so they do not trigger
  a save. A `required` field (titles) does not save an empty value.
- **Leaving the editor.** `useSavedRichText` shows what the editor just saved
  until the stored row catches up, so the read view never flashes the old
  text. It also hands that saved doc to an editor reopened in the meantime:
  seeding from text there would start a second copy of the text, and merging
  the two copies duplicates it.
- **Views.** Titles and checklist items render the cheap `RichTextView` and
  mount an editor only while editing, because lists hold many of them. The
  caret opens at the clicked character by passing the click's text offset
  (`caret.ts`) into the editor. Descriptions are always an editor, so remote
  edits and clickable links stay live.
- **Markdown markers** (`**` around bold text) are decorations, not document
  content, and only show while the editor is focused.
- **Paste.** Plain text is parsed as Markdown in the field's kind. Rich HTML is
  left to ProseMirror, except from code editors that wrap plain source in HTML.
  A lone URL is left to the link extension so it can link a selection.
- **Links** go through `linkHref` in both the view and the editor, which
  refuses schemes such as `javascript:`.

### Browser and library quirks

- **Focus synchronously.** Tiptap's `focus` command waits a frame. Keys typed
  in that frame reach the global task shortcuts, and the late caret move undoes
  arrow presses. The editor calls `view.focus()` and sets the selection itself.
- **ProseMirror's base CSS** turns off font features, which swaps the app's
  Inter glyphs while editing; `index.css` restores them.
- **Global shortcuts** must ignore keys the editor handled. ProseMirror calls
  `preventDefault` on keys it handles, so window listeners check
  `defaultPrevented` (the sidebar's `Mod+B` toggled on every bold).
- **Event isolation.** The editor wrapper stops pointer and click propagation
  so selecting text does not drag cards or trigger card double-click.

## Adding a rich text field

1. Add an optional doc field next to the text field in the table schema and
   register the pair with `registerRichTextFields`.
2. Route every write of the row through a sync helper in `richTextItems.ts`, so
   text writes become doc edits.
3. Edit it with `RichTextEditor` and save the doc, not the text.
