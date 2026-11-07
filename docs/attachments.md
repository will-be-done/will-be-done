# Attachments

Files attached to Tasks, TaskTemplates, and Notes. The rows sync like any other
model; the bytes never do. This document covers why it is split that way and
the rules that keep the two halves consistent.

## Rows and bytes

- **`attachments`** is the space's file library: name, type, size, and SHA-256.
  Bytes are immutable, so an ID always names the same content. That makes every
  upload idempotent and lets downloads be cached forever.
- **`item_attachments`** lists a file under an item. One file can be listed by
  several items: copies, the tasks a template generates, or a reference pasted
  into another description. Settings' "used in" reads these links.
- **Inline references** are `![name](wbd-attachment:<id>)` in a title or
  description (see [rich-text.md](rich-text.md)). An inline reference always
  has a link: item writes call `ensureInlineAttachmentLinks`, so "used in"
  never parses Markdown. A new writer of `title` or `content` must do the same.

Bytes live in a per-space IndexedDB on each device
(`apps/web/src/store/attachments/blobStore.ts`) and in the server's
`AttachmentStorage` (`apps/api/src/attachments/storage.ts`, local disk or S3).
Keep them out of HyperDB: rows there are preloaded and synced in full.

## Lifecycle

- **Adding** writes the bytes locally first, then the row, so the file works
  offline at once. The bytes upload after the row has reached the server; the
  server checks size and SHA-256 against the row and refuses a mismatch.
- **Removing from an item** deletes the link and the item's inline references,
  then deletes the file if nothing else lists it. **Deleting a file** removes
  every link and inline reference. Inline references are deleted from the Yjs
  doc directly, not by rewriting text, so concurrent typing survives.
- **Trash.** Trashing an item moves its links into the trash snapshot and leaves
  the file. A file listed only by trashed items stays until the trash entry is
  purged, so restoring brings it back. Purging deletes files left unlisted.
- **Conversions** replace an item's ID, so they move links before deleting the
  old row; deleting first would make the file look unused.

## Server storage cleanup

The server never deletes bytes on a request. A daily sweep
(`apps/api/src/attachments/cleanup.ts`) deletes bytes whose row has been
tombstoned for 7 days, so undo and offline replicas that still hold the row can
settle. It also deletes bytes whose row never arrived after a day. Use the
tombstone's clock, not file age, for deleted rows: a file uploaded long ago and
deleted today must survive the grace period.

Local storage is per machine. Several server instances need S3 storage.

## Transfers

`makeAttachmentTransfers` (`apps/web/src/store/attachments/transfers.ts`) runs
in each space store's scope and keeps every file of the space on the device.
The tab that wins the `TabChannels` leader election moves bytes; other tabs
follow its status over a tab channel. It reconciles rows against the local store at startup and
after each completed sync:

- A missing file downloads. A 404 means the adding device has not uploaded yet;
  it retries a minute later.
- A pending file uploads. A 404 means its row has not synced yet; it retries
  after the next sync, not on a timer.
- Uploaded bytes without a row are deleted at startup. Pending bytes without a
  row are kept: another tab may not have persisted the new row yet.
- Running out of browser storage stops downloads for the session. Files then
  stay on the server and open on demand.

## Serving bytes

Bytes come from the user's own space, but may be HTML, SVG, or scripts.
Downloads carry `Content-Security-Policy: sandbox`, and only plain image, PDF,
text, audio, and video types are served inline. The web client applies the same
list before opening a blob URL, which would otherwise run on the app's origin.

## Backups

A space export is a zip of `backup.json` and `attachments/<id>`. Restoring it
re-uploads the bytes, since the target server may not have them. Scheduled
server backups mirror local attachment storage to the backup bucket, append-only
so older database backups still find their files. With S3 attachment storage,
the bucket's own durability is the backup.
