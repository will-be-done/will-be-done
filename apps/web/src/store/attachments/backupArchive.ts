import { strFromU8, strToU8, unzip, zip, type Zippable } from "fflate";
import type { SubscribableDB } from "@will-be-done/hyperdb";
import { asyncDispatch } from "@will-be-done/hyperdb";
import { getSpaceBackup, type Backup } from "@will-be-done/slices/space";
import { restoreSpaceBackup } from "../undo";
import { attachmentTransfersByDB } from "./transfers";

const BACKUP_FILE = "backup.json";
const FILES_DIR = "attachments/";

// A space backup is a zip of its data and its files, so restoring it on
// another server or device needs nothing else.
export async function createBackupArchive(db: SubscribableDB) {
  const backup = (await asyncDispatch(db, getSpaceBackup({}))) as Backup;
  const transfers = attachmentTransfersByDB.get(db);
  const entries: Zippable = {
    [BACKUP_FILE]: strToU8(JSON.stringify(backup, null, 2)),
  };
  const missing: string[] = [];
  for (const attachment of backup.attachments ?? []) {
    const blob = await transfers?.readBlob({
      type: "attachment",
      ...attachment,
    });
    if (!blob) {
      missing.push(attachment.name);
      continue;
    }
    // Most files are compressed already.
    entries[`${FILES_DIR}${attachment.id}`] = [
      new Uint8Array(await blob.arrayBuffer()),
      { level: 0 },
    ];
  }
  const data = await new Promise<Uint8Array>((resolve, reject) =>
    zip(entries, (error, result) => (error ? reject(error) : resolve(result))),
  );
  return {
    archive: new Blob([data as BlobPart], { type: "application/zip" }),
    missing,
  };
}

export async function restoreBackupFile(db: SubscribableDB, file: File) {
  if (!file.name.endsWith(".zip")) {
    await restoreSpaceBackup(db, JSON.parse(await file.text()) as Backup);
    return;
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries = await new Promise<Record<string, Uint8Array>>(
    (resolve, reject) =>
      unzip(bytes, (error, result) =>
        error ? reject(error) : resolve(result),
      ),
  );
  const json = entries[BACKUP_FILE];
  if (!json) throw new Error("The archive has no backup.json");
  const backup = JSON.parse(strFromU8(json)) as Backup;
  const transfers = attachmentTransfersByDB.get(db);
  for (const attachment of backup.attachments ?? []) {
    const content = entries[`${FILES_DIR}${attachment.id}`];
    if (!content) continue;
    await transfers?.importBlob(
      attachment.id,
      new Blob([content as BlobPart], { type: attachment.mimeType }),
    );
  }
  await restoreSpaceBackup(db, backup);
}
