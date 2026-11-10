import { strFromU8, strToU8, unzip, zip, type Zippable } from "fflate";
import { getSpaceBackup, type Backup } from "@will-be-done/slices/space";
import { Data, Effect } from "effect";
import { Database, DatabaseError } from "../database";
import { restoreSpaceBackup } from "../undo";
import { attachmentTransfersByDB } from "./transfers";

const BACKUP_FILE = "backup.json";
const FILES_DIR = "attachments/";
const FILE_CONCURRENCY = 4;

// The file is not a backup this app wrote.
export class InvalidBackupError extends Data.TaggedError("InvalidBackupError")<{
  readonly cause: unknown;
}> {}

export class BackupArchiveError extends Data.TaggedError("BackupArchiveError")<{
  readonly cause: unknown;
}> {}

const zipEntries = (entries: Zippable) =>
  Effect.callback<Uint8Array, BackupArchiveError>((resume) => {
    const terminate = zip(entries, (cause, data) =>
      resume(
        cause
          ? Effect.fail(new BackupArchiveError({ cause }))
          : Effect.succeed(data),
      ),
    );
    return Effect.sync(terminate);
  });

const unzipEntries = (bytes: Uint8Array) =>
  Effect.callback<Record<string, Uint8Array>, InvalidBackupError>((resume) => {
    const terminate = unzip(bytes, (cause, entries) =>
      resume(
        cause
          ? Effect.fail(new InvalidBackupError({ cause }))
          : Effect.succeed(entries),
      ),
    );
    return Effect.sync(terminate);
  });

const parseBackup = (json: string) =>
  Effect.try({
    try: () => JSON.parse(json) as Backup,
    catch: (cause) => new InvalidBackupError({ cause }),
  });

const readFile = <A>(read: () => Promise<A>) =>
  Effect.tryPromise({
    try: read,
    catch: (cause) => new InvalidBackupError({ cause }),
  });

// A space backup is a zip of its data and its files, so restoring it on
// another server or device needs nothing else. Files this device cannot read
// are left out and listed as missing.
export const createBackupArchive = Effect.gen(function* () {
  const database = yield* Database;
  const backup = (yield* database.dispatch(getSpaceBackup({}))) as Backup;
  const transfers = attachmentTransfersByDB.get(database.hyperDB);
  const files = yield* Effect.forEach(
    backup.attachments ?? [],
    (attachment) =>
      Effect.gen(function* () {
        const blob = transfers
          ? yield* transfers.readBlob({ type: "attachment", ...attachment })
          : undefined;
        if (!blob) return { attachment, bytes: undefined };
        const bytes = yield* Effect.promise(() => blob.arrayBuffer());
        return { attachment, bytes: new Uint8Array(bytes) };
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.as(
            Effect.logError(`Could not back up ${attachment.name}`, cause),
            { attachment, bytes: undefined },
          ),
        ),
      ),
    { concurrency: FILE_CONCURRENCY },
  );
  const entries: Zippable = {
    [BACKUP_FILE]: strToU8(JSON.stringify(backup, null, 2)),
  };
  const missing: string[] = [];
  for (const file of files) {
    if (!file.bytes) {
      missing.push(file.attachment.name);
      continue;
    }
    // Most files are compressed already.
    entries[`${FILES_DIR}${file.attachment.id}`] = [file.bytes, { level: 0 }];
  }
  const data = yield* zipEntries(entries);
  return {
    archive: new Blob([data as BlobPart], { type: "application/zip" }),
    missing,
  };
});

// A .json file is an older backup without files.
export const restoreBackupFile = (file: File) =>
  Effect.gen(function* () {
    const database = yield* Database;
    let backup: Backup;
    if (file.name.endsWith(".zip")) {
      const bytes = yield* readFile(() => file.arrayBuffer());
      const entries = yield* unzipEntries(new Uint8Array(bytes));
      const json = entries[BACKUP_FILE];
      if (!json) {
        return yield* new InvalidBackupError({
          cause: new Error(`The archive has no ${BACKUP_FILE}`),
        });
      }
      backup = yield* parseBackup(strFromU8(json));
      const transfers = attachmentTransfersByDB.get(database.hyperDB);
      if (transfers) {
        yield* Effect.forEach(
          backup.attachments ?? [],
          (attachment) => {
            const content = entries[`${FILES_DIR}${attachment.id}`];
            return content
              ? transfers.importBlob(
                  attachment.id,
                  new Blob([content as BlobPart], {
                    type: attachment.mimeType,
                  }),
                )
              : Effect.void;
          },
          { concurrency: FILE_CONCURRENCY, discard: true },
        );
      }
    } else {
      backup = yield* parseBackup(yield* readFile(() => file.text()));
    }
    yield* Effect.tryPromise({
      try: () => restoreSpaceBackup(database.hyperDB, backup),
      catch: (cause) => new DatabaseError({ cause }),
    });
  });
