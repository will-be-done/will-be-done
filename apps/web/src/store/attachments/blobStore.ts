import { Data, Effect, type Scope } from "effect";

// File bytes live outside HyperDB so they never enter the preload or sync.
// `pending` holds the IDs whose bytes the server has not confirmed yet.
const BLOBS = "blobs";
const PENDING = "pending";

export class AttachmentBlobStoreError extends Data.TaggedError(
  "AttachmentBlobStoreError",
)<{ readonly cause: unknown }> {}

export class AttachmentStorageFullError extends Data.TaggedError(
  "AttachmentStorageFullError",
)<{ readonly cause: unknown }> {}

export type BlobStoreError =
  | AttachmentBlobStoreError
  | AttachmentStorageFullError;

const failure = (cause: unknown): BlobStoreError =>
  cause instanceof DOMException && cause.name === "QuotaExceededError"
    ? new AttachmentStorageFullError({ cause })
    : new AttachmentBlobStoreError({ cause });

export interface AttachmentBlobStore {
  readonly get: (id: string) => Effect.Effect<Blob | undefined, BlobStoreError>;
  readonly put: (
    id: string,
    blob: Blob,
    options: { uploaded: boolean },
  ) => Effect.Effect<void, BlobStoreError>;
  readonly markUploaded: (id: string) => Effect.Effect<void, BlobStoreError>;
  readonly delete: (id: string) => Effect.Effect<void, BlobStoreError>;
  readonly keys: Effect.Effect<
    { stored: Set<string>; pending: Set<string> },
    BlobStoreError
  >;
}

// Opens the database on first use; closing the scope closes it.
export const makeAttachmentBlobStore = (
  indexedDB: IDBFactory,
  name: string,
): Effect.Effect<AttachmentBlobStore, never, Scope.Scope> =>
  Effect.gen(function* () {
    let opened: IDBDatabase | undefined;
    const database = yield* Effect.cached(
      Effect.callback<IDBDatabase, BlobStoreError>((resume) => {
        const request = indexedDB.open(`attachments-${name}`, 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore(BLOBS);
          request.result.createObjectStore(PENDING);
        };
        request.onsuccess = () => {
          opened = request.result;
          resume(Effect.succeed(request.result));
        };
        request.onerror = () => resume(Effect.fail(failure(request.error)));
      }),
    );
    yield* Effect.addFinalizer(() => Effect.sync(() => opened?.close()));

    // Requests start inside the callback, so their handlers attach before
    // IndexedDB can fire them.
    const write = (
      stores: string | string[],
      run: (tx: IDBTransaction) => void,
    ) =>
      Effect.flatMap(database, (db) =>
        Effect.callback<void, BlobStoreError>((resume) => {
          const tx = db.transaction(stores, "readwrite");
          run(tx);
          tx.oncomplete = () => resume(Effect.void);
          tx.onerror = tx.onabort = () =>
            resume(Effect.fail(failure(tx.error)));
        }),
      );

    return {
      get: (id) =>
        Effect.flatMap(database, (db) =>
          Effect.callback<Blob | undefined, BlobStoreError>((resume) => {
            const request = db
              .transaction(BLOBS, "readonly")
              .objectStore(BLOBS)
              .get(id) as IDBRequest<Blob | undefined>;
            request.onsuccess = () => resume(Effect.succeed(request.result));
            request.onerror = () => resume(Effect.fail(failure(request.error)));
          }),
        ),
      put: (id, blob, { uploaded }) =>
        write([BLOBS, PENDING], (tx) => {
          tx.objectStore(BLOBS).put(blob, id);
          if (uploaded) tx.objectStore(PENDING).delete(id);
          else tx.objectStore(PENDING).put(true, id);
        }),
      markUploaded: (id) =>
        write(PENDING, (tx) => tx.objectStore(PENDING).delete(id)),
      delete: (id) =>
        write([BLOBS, PENDING], (tx) => {
          tx.objectStore(BLOBS).delete(id);
          tx.objectStore(PENDING).delete(id);
        }),
      keys: Effect.flatMap(database, (db) =>
        Effect.callback<
          { stored: Set<string>; pending: Set<string> },
          BlobStoreError
        >((resume) => {
          const tx = db.transaction([BLOBS, PENDING], "readonly");
          const stored = tx.objectStore(BLOBS).getAllKeys();
          const pending = tx.objectStore(PENDING).getAllKeys();
          tx.oncomplete = () =>
            resume(
              Effect.succeed({
                stored: new Set(stored.result.map(String)),
                pending: new Set(pending.result.map(String)),
              }),
            );
          tx.onerror = tx.onabort = () =>
            resume(Effect.fail(failure(tx.error)));
        }),
      ),
    };
  });
