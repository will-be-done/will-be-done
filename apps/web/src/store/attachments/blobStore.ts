// File bytes live outside HyperDB so they never enter the preload or sync.
// `pending` holds the IDs whose bytes the server has not confirmed yet.
const BLOBS = "blobs";
const PENDING = "pending";

const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

export class AttachmentBlobStore {
  private db: Promise<IDBDatabase> | undefined;

  constructor(private name: string) {}

  private open() {
    this.db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(`attachments-${this.name}`, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(BLOBS);
        req.result.createObjectStore(PENDING);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.db;
  }

  async get(id: string) {
    const db = await this.open();
    return (await request(
      db.transaction(BLOBS, "readonly").objectStore(BLOBS).get(id),
    )) as Blob | undefined;
  }

  async put(id: string, blob: Blob, { uploaded }: { uploaded: boolean }) {
    const db = await this.open();
    const tx = db.transaction([BLOBS, PENDING], "readwrite");
    tx.objectStore(BLOBS).put(blob, id);
    if (uploaded) tx.objectStore(PENDING).delete(id);
    else tx.objectStore(PENDING).put(true, id);
    await done(tx);
  }

  async markUploaded(id: string) {
    const db = await this.open();
    const tx = db.transaction(PENDING, "readwrite");
    tx.objectStore(PENDING).delete(id);
    await done(tx);
  }

  async delete(id: string) {
    const db = await this.open();
    const tx = db.transaction([BLOBS, PENDING], "readwrite");
    tx.objectStore(BLOBS).delete(id);
    tx.objectStore(PENDING).delete(id);
    await done(tx);
  }

  async keys() {
    const db = await this.open();
    const tx = db.transaction([BLOBS, PENDING], "readonly");
    const [stored, pending] = await Promise.all([
      request(tx.objectStore(BLOBS).getAllKeys()),
      request(tx.objectStore(PENDING).getAllKeys()),
    ]);
    return {
      stored: new Set(stored.map(String)),
      pending: new Set(pending.map(String)),
    };
  }
}
