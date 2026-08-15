# Sync Engine Design and Invariants

This document is the normative design for the Will Be Done sync engine. Any
change to sync behavior, storage, merge rules, clocks, transport, backup, or
database hooks must preserve the invariants below. If an invariant must change,
update this document and the recovery/consistency tests in the same change.

The current wire protocol is version 4. It is a hard protocol boundary: v3
upload and download procedures must not be reintroduced as an alternate path.

## Required Server-Backup Recovery Guarantee

The protocol must support restoring the server from a backup that is older
than one or more clients. A restored server is not automatically authoritative
for history that occurred after its backup: synchronized clients are recovery
sources for that missing history.

When a client reports a server-confirmed cursor or revision newer than the
restored server has persisted, the server must detect that it is behind and ask
the client to resend its newer materialized changes. It must not reject those
changes merely because their HLC values are ahead of the restored server, clamp
them to the restored state, or incorrectly treat the client's higher covered
cursor as already accepted.

The server merges the resent materialized state using the normal deterministic
merge rules and assigns new server revisions in the restored history. As
clients reconnect, their newer states collectively reconstruct changes lost by
the server backup. This recovery must be incremental from each restored
per-client cursor; only a missing cursor requires that client to resend its
complete materialized change set.

## Goals

The engine provides:

- deterministic convergence between clients and the server;
- atomic visibility for related domain changes;
- safe recovery when either a client or the server is restored from backup;
- resumable transport without making transport chunks logical transactions;
- effect-idempotent retries at every network boundary;
- suppression of redundant upload echoes without hiding conflict corrections;
- bounded request-path reads and memory use.

## Two Independent Orders

The protocol deliberately does not use one value for every ordering problem.

### Hybrid logical clock

Every materialized `Change` contains HLC timestamps. HLC values determine
causal/LWW ordering for creations, fields, and tombstones. They use the fixed
width form:

```text
<16-digit physical milliseconds>-<8-digit logical counter>-<actor id>
```

Before producing a local timestamp, a writer observes the latest persisted
clock and any received clocks. Browser windows use an ephemeral writer suffix
in addition to the stable client ID, preventing simultaneous tabs from
producing the same timestamp. Existing legacy clocks are canonicalized when a
database is opened.

HLC is not the server download cursor. Wall-clock rollback must never make a
new HLC smaller, but HLC values still describe causal domain state rather than
server history.

### Server revision

The server maintains a monotonic revision and a materialized change feed.
Revisions determine which canonical server states a client has applied.
Revision/feed writes occur in the same database transaction as the associated
`changes` writes. A client acknowledges only the final revision returned after
an atomic server operation; it must not treat an individual internal feed
revision as a separately visible domain transaction.

The WebSocket notification is only a wake-up hint. It carries no authoritative
cursor and may be duplicated or lost. The persisted server revision is the
authority.

## Persisted State

### Materialized change log

Each syncable row has one materialized `changes` record identified by
`<tableName>:<entityId>`. It stores:

- the creation HLC;
- the latest receipt/materialization HLC;
- an optional permanent deletion HLC;
- per-field HLC values;
- the client that won the relevant merge state.

The outbound cursor is the stable compound key `[updatedAt, id]`. The `id`
tie-breaker is mandatory: a timestamp alone can skip rows that share an HLC.

### Server state

Each user or space database stores:

- the current server revision;
- a revision-indexed materialized change feed;
- for every client ID, the greatest accepted client cursor;
- for every client ID, the greatest acknowledged server revision;
- temporary upload and download sessions/chunks.

The per-client cursor is part of server backup state. Restoring an older backup
therefore makes the server ask clients to resend only the materialized changes
after the restored cursor.

### Client state

The client separately persists:

- `serverConfirmedClientCursor`: what the server has confirmed accepting;
- `localCoveredClientCursor`: locally generated receipt clocks for server data
  that the server already semantically knows;
- `lastServerAppliedRevision`: the newest server revision atomically applied;
- `serverConfirmedAppliedRevision`: the revision the server has confirmed the
  client acknowledged.

These values must not be collapsed into one cursor. They represent different
facts and are intentionally redundant enough to detect backup rollback.

The client also persists temporary frozen upload chunks and staged download
chunks. This makes a transport retry use the same logical snapshot after a
reload or lost response.

## Session Handshake and Recovery

At session start the client sends both what it believes the server confirmed
and what its current local database covers. The server compares those claims
with its persisted per-client state.

### Normal case

When the expected client cursor and acknowledged revision match server state,
the server may advance the accepted cursor through
`localCoveredClientCursor`. This is safe because that range consists of local
receipt records for canonical server data. The server returns the authoritative
upload start cursor and download start revision.

### Server restored from an older backup

If the server's accepted client cursor or acknowledged revision is behind what
the client expected, `serverHistoryLost` is true.

The server must:

- ignore the client's higher covered cursor;
- use the restored server cursor as `uploadFromCursor`;
- use the restored acknowledged revision as `downloadFromRevision`;
- require the client to resend every materialized change after that cursor.

The resend is incremental. A full upload is required only when the restored
server has no cursor for that client. Replaying materialized state reconstructs
the lost server state without requiring a permanent operation log.

This includes changes created locally after the backup and newer canonical
changes the client previously received from the server. Resent HLC values are
observed before the restored server generates new merge clocks, preserving
causal ordering even when the restored server's wall clock or persisted HLC is
older.

### Client restored from an older backup or lost a response

If the server is ahead of the client's expected state, `serverAhead` is true.
The server remains authoritative. The client starts after the server's accepted
cursor and downloads canonical state after its applied revision. It must not
force the server cursor backward.

A committed upload result is stored on the server. If the commit response was
lost, retrying the same commit returns the stored result rather than merging a
second logical batch.

## Consistency and Atomicity

Transport chunks are never consistency boundaries.

### Upload

1. The client starts a session and receives the authoritative upload cursor.
2. In one local database transaction, it freezes every materialized change
   after `[clock, changeId]` into temporary chunk rows.
3. It uploads those chunks as their exact frozen JSON payload strings and may
   retry them. The checksum covers those payload bytes before schema parsing,
   so object-key reconstruction cannot change the checksum identity.
4. The server keeps them only in staging tables. Staged rows are invisible to
   the live domain tables.
5. Commit validates a complete, contiguous manifest.
6. The server processes tables in dependency order and merges every staged
   change inside one live database transaction.

For example, a `Task` and a `DailyEntry`/projection that references it may be
transported in different chunks, but neither becomes visible until the whole
commit succeeds. A failed commit rolls back the entire merge.

### Download

Small responses are returned inline. Large responses are stored as server
download chunks. The client verifies and persists every chunk before applying
anything.

The client then applies all chunks and advances its server revision in one
local database transaction. It never applies a page and advances the cursor
before later pages arrive. New local writes that appear after the frozen upload
cause the apply to be deferred to another sync session rather than overwritten.

This rule is absolute: pagination/chunking may bound transport and staging, but
must never expose a partially applied logical sync response.

## Merge Rules

- Per-field conflicts use HLC last-writer-wins ordering.
- Concurrent creation of the same ID uses deterministic first-creator-wins
  behavior before field merging.
- Tombstones are permanent. A deleted ID cannot be reused.
- Entry conflicts such as multiple daily/stash entries for one task are
  resolved deterministically before the generic merge.
- Dependency-bearing table types are committed in a stable order: parents and
  lists first, tasks/templates next, then checklist and entry/projection rows.
- Receipt metadata such as a newly generated `updatedAt` must not by itself
  make an already converged state a new semantic change.

## Echo Suppression

The commit response omits a currently uploaded change only when the resulting
canonical server state is semantically identical to the staged state. The
comparison includes the row, creation/deletion state, winning client, and
per-field clocks; it ignores the server's receipt/materialization `updatedAt`.

If the server changed any semantic value while resolving a conflict, the
canonical correction is returned to the uploader.

Never suppress changes solely because `clientId` matches. A change from the
same client may be required after a lost response, client restore, conflict, or
server recovery. Echo suppression is an optimization after a semantic equality
check, not a correctness rule.

## Idempotency

Every retry boundary is effect-idempotent:

- Upload chunks use `(uploadId, sequence)` as identity. Repeating the same
  checksum succeeds; sending different content for that identity fails. The
  checksum is verified against the exact frozen payload before the server
  parses and validates its changesets.
- Commit checks the contiguous chunk count, total change count, through cursor,
  and SHA-256 manifest checksum.
- The server persists the successful commit response. A commit retry returns
  that response without reapplying the batch.
- Domain merge compares semantic state without receipt `updatedAt`, so replaying
  an already converged change performs no domain or change-log write.
- Download chunks and their manifest are checksummed. The client stages them by
  `(downloadId, sequence)` and verifies them before apply.
- Applying a staged download and advancing the client revision is one
  transaction. A crash leaves either the old state or the complete new state.
- Download acknowledgement and temporary-session cleanup are effect-idempotent.
- Permanent tombstones ensure a replay cannot resurrect a deleted entity.

## Transport Limits and Lifecycle

Current v4 limits are:

- at most 256 changes per upload chunk;
- at most 1 MiB of encoded changes per upload chunk;
- at most 4,096 chunks and 256 MiB per upload session;
- inline download only up to 256 changes and 1 MiB;
- temporary server sessions expire after 24 hours.

Request-path reads must remain bounded by a session, indexed cursor, table, or
chunk limit. Large transfers may be scanned and staged incrementally, but the
final domain apply remains atomic.

## Internal HTTP Protocol

Protocol v4 uses authenticated routes under:

```text
/api/sync/v4/:dbType/:dbId
```

The flow consists of session creation, idempotent chunk `PUT`s, commit,
optional staged download chunk reads, and download acknowledgement. These are
internal sync routes, not public v1 API operations.

No direct "send changes and merge immediately" endpoint may coexist with v4.
Such an endpoint would bypass staging, manifest validation, recovery cursors,
and atomic consistency.

## Rules for Future Changes

Any sync change must preserve all of the following:

1. Never use wall-clock/HLC time as the server download cursor.
2. Never remove the `id` tie-breaker from a client change cursor.
3. Never trust a higher client covered cursor while the server is behind.
4. Never move a server cursor backward when the client is behind.
5. Never merge an upload chunk directly into live domain tables.
6. Never apply or expose only part of a logical upload/download batch.
7. Never acknowledge a cursor or revision before the associated transaction
   commits.
8. Never suppress an echo without semantic equality; always return canonical
   conflict corrections.
9. Never make receipt timestamps defeat merge idempotency.
10. Never discard tombstones or permit deleted IDs to be reused.
11. Every syncable server-side domain write must update the revision feed in
    the same database transaction.
12. Retries after timeouts, reloads, duplicated requests, and lost responses
    must remain effect-idempotent.
13. Server-backup and client-backup recovery must remain incremental whenever a
    persisted cursor exists.
14. A restored server must accept newer client materialized state as recovery
    input and must never silently discard it because the server backup is older.
15. Keep queries and memory bounded during snapshotting, staging, and download
    construction.
16. Update this document and add regression tests whenever protocol state or an
    invariant changes.

At minimum, sync-logic changes must test normal convergence, exact echo
suppression, canonical conflict correction, duplicate chunk/commit retries,
atomic parent-and-projection application, server backup rollback, client backup
rollback, HLC wall-clock rollback, permanent tombstones, and staged-download
recovery.
