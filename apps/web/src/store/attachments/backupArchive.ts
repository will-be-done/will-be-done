import { strToU8 } from "fflate";
import { getSpaceBackup, type Backup } from "@will-be-done/slices/space";
import { Data, Effect } from "effect";
import { Database, DatabaseError } from "../database";
import { restoreSpaceBackup } from "../undo";
import { attachmentTransfersByDB } from "./transfers";
import { makeZipWriter, readZip } from "./zipArchive";

const BACKUP_FILE = "backup.json";
const FILES_DIR = "attachments/";
const IMPORT_CONCURRENCY = 4;

// The file is not a backup this app wrote.
export class InvalidBackupError extends Data.TaggedError("InvalidBackupError")<{
  readonly cause: unknown;
}> {}

export class BackupArchiveError extends Data.TaggedError("BackupArchiveError")<{
  readonly cause: unknown;
}> {}

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

const archiving = <A>(write: () => A) =>
  Effect.try({
    try: write,
    catch: (cause) => new BackupArchiveError({ cause }),
  });

// A space backup is a zip of its data and its files, so restoring it on
// another server or device needs nothing else. Files this device cannot read
// are left out and listed as missing.
export const createBackupArchive = Effect.gen(function* () {
  const database = yield* Database;
  const backup = (yield* database.dispatch(getSpaceBackup({}))) as Backup;
  const transfers = attachmentTransfersByDB.get(database.hyperDB);
  const writer = makeZipWriter();
  yield* archiving(() =>
    writer.add(BACKUP_FILE, strToU8(JSON.stringify(backup, null, 2)), {
      compress: true,
    }),
  );
  const missing: string[] = [];
  // One at a time, so a space larger than memory still fits in a backup.
  for (const attachment of backup.attachments ?? []) {
    const added = yield* Effect.gen(function* () {
      const blob = transfers
        ? yield* transfers.readBlob({ type: "attachment", ...attachment })
        : undefined;
      if (!blob) return false;
      const bytes = yield* Effect.promise(() => blob.arrayBuffer());
      yield* archiving(() =>
        writer.add(`${FILES_DIR}${attachment.id}`, new Uint8Array(bytes)),
      );
      return true;
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.as(
          Effect.logError(`Could not back up ${attachment.name}`, cause),
          false,
        ),
      ),
    );
    if (!added) missing.push(attachment.name);
  }
  return { archive: yield* archiving(writer.finish), missing };
});

// A .json file is an older backup without files.
export const restoreBackupFile = (file: File) =>
  Effect.gen(function* () {
    const database = yield* Database;
    const restore = (backup: Backup) =>
      Effect.tryPromise({
        try: () => restoreSpaceBackup(database.hyperDB, backup),
        catch: (cause) => new DatabaseError({ cause }),
      });
    if (!file.name.endsWith(".zip")) {
      return yield* restore(
        yield* parseBackup(yield* readFile(() => file.text())),
      );
    }

    const zip = yield* readFile(() => readZip(file));
    const json = yield* readFile(() => zip.get(BACKUP_FILE));
    if (!json) {
      return yield* new InvalidBackupError({
        cause: new Error(`The archive has no ${BACKUP_FILE}`),
      });
    }
    const backup = yield* parseBackup(yield* readFile(() => json.text()));
    const transfers = attachmentTransfersByDB.get(database.hyperDB);
    if (!transfers) return yield* restore(backup);

    // Files go in before the rows that make them visible and uploadable.
    const imported: string[] = [];
    yield* Effect.forEach(
      backup.attachments ?? [],
      (attachment) =>
        Effect.gen(function* () {
          const content = yield* readFile(() =>
            zip.get(`${FILES_DIR}${attachment.id}`, attachment.mimeType),
          );
          if (!content) return;
          if (yield* transfers.importBlob(attachment, content)) {
            imported.push(attachment.id);
          } else {
            yield* Effect.logWarning(
              `Skipped ${attachment.name}: damaged in the backup or already on this device`,
            );
          }
        }),
      { concurrency: IMPORT_CONCURRENCY, discard: true },
    ).pipe(
      Effect.andThen(restore(backup)),
      Effect.onError(() =>
        Effect.ignore(transfers.discardUnlistedBlobs(imported)),
      ),
    );
  });
