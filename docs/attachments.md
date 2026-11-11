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
  Uploads stream into storage and are never held in memory, so they need a
  `Content-Length`: S3 must know it before the body arrives. Local storage
  checks into a temp file and renames; S3 checks the `x-amz-checksum-sha256`
  header, so wrong bytes never replace stored ones.
- **Removing from an item** deletes the link and the item's inline references
  but keeps the file, which Settings then shows as unused. Clients never delete
  a file implicitly: another replica may list it again meanwhile, and only the
  server sees the merged state (see cleanup below). **Deleting a file** removes
  every link and inline reference. Inline references are deleted from the Yjs
  doc directly, not by rewriting text, so concurrent typing survives.
- **Trash.** A trashed item keeps its links, so finding where a file is used
  or whether it is orphaned is an indexed read, never a scan of trash
  snapshots. A link whose item is missing belongs to a trashed item. Purging
  deletes the links only. Deleting a file also strips its
  references from trash snapshots, or restoring would bring them back.
- **Link IDs** derive from the item and the file, so replicas that link the
  same file to the same item (inline references, generated tasks) converge on
  one row.
- **Conversions** replace an item's ID, so they move links before deleting the
  old row; deleting first would make the file look unused.

## Server storage cleanup

The server never deletes bytes on a request. A daily sweep
(`apps/api/src/attachments/cleanup.ts`) runs over the spaces this server has
loaded, like the calendar scheduler, so it never opens every database. Every
grace period counts from when the sweep first saw a file unused, recorded in the
server-only `attachment_sweep_marks` table. Neither file age nor the deleting
device's clock is used: a file uploaded long ago and deleted today must survive,
and a device with a wrong clock must not shorten the wait.

- Rows no item has listed for 30 days are deleted, which tombstones them on
  every replica. Relisting the file in the meantime restarts the wait.
- Bytes whose row has been tombstoned for 7 days are deleted, so undo and
  offline replicas that still hold the row can settle.
- Bytes whose row never arrived are deleted after 30 days. A server
  restored from a backup has no rows for files added since the backup, and
  clients resend those rows as they reconnect
  ([sync.md](sync.md#required-server-backup-recovery-guarantee)). They never
  resend bytes they have already uploaded, so a shorter grace period would lose
  those files for good. Attachment storage must also be at least as recent as the
  database: restoring storage to an older state loses files the same way.
  A crashed local upload can leave a temp file; listing removes those a day old.

Local storage is per machine and must be on a persistent volume. Several server
instances, or machines with ephemeral disks, need S3 storage.

## Transfers

`makeAttachmentTransfers` (`apps/web/src/store/attachments/transfers.ts`) runs
in each space store's scope and keeps every file of the space on the device.
The tab that wins the `TabChannels` leader election moves bytes; other tabs
follow its status over a tab channel. It reconciles rows against the local
store at startup and whenever the `attachments` table changes, from this tab,
another, or a sync. Other syncs do not trigger a pass.

- A missing file downloads. A 404 means the adding device has not uploaded yet;
  it retries after a minute, backing off to an hour.
- A pending file uploads. A 404 means its row has not synced yet; it retries
  after the next sync, not on a timer. If a sync completed while the upload ran,
  it retries at once, since that sync may already have delivered the row.
- Uploaded bytes without a row are deleted at startup. Pending bytes without a
  row are deleted only when the row has a tombstone; otherwise another tab may
  not have persisted the new row yet. The pass runs once per session, so
  undoing a removal still finds the bytes.
- Running out of browser storage stops downloads for the session. Files then
  stay on the server, and opening one fetches it without storing it.

## Serving bytes

Bytes come from the user's own space, but may be HTML, SVG, or scripts.
Downloads carry `Content-Security-Policy: sandbox`, and only plain image, PDF,
text, audio, and video types are served inline. The web client applies the same
list before opening a blob URL, which would otherwise run on the app's origin.

## Backups

A space export is a zip of `backup.json` and `attachments/<id>`. Restoring it
re-uploads the bytes, since the target server may not have them. A local copy
that matches its row is kept over the archive's bytes but uploads again, since
the restored server may have lost it. Otherwise the archive's bytes are imported
only when their size and SHA-256 match their rows, so a damaged archive cannot
replace or add wrong bytes. The archive
is written one file at a time and read through its central directory
(`zipArchive.ts`), so neither direction holds the whole space in memory. It has
no Zip64 support, which caps an export at 4 GB. Scheduled
server backups mirror local attachment storage to the backup bucket, append-only
so older database backups still find their files. A file that vanished
since it was listed is skipped; any other failed copy fails the run, so a
backup never counts as complete without its files. With S3 attachment storage,
the bucket's own durability is the backup.
