import type { SkinRecord } from "./registry";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("notsu-skins", 1);
    let settled = false;
    const fail = (cause: unknown) => { if (!settled) { settled = true; clearTimeout(timer); reject(cause); } };
    const timer = setTimeout(() => fail(new Error("Skin storage took too long to open.")), 5000);
    request.onupgradeneeded = () => {
      if (settled) { request.transaction?.abort(); return; }
      request.result.createObjectStore("packs", { keyPath: "id" });
    };
    request.onerror = () => fail(request.error);
    request.onblocked = () => fail(new Error("Another window is updating skin storage. Close it and try again."));
    request.onsuccess = () => {
      clearTimeout(timer);
      if (settled) request.result.close();
      else { settled = true; resolve(request.result); }
    };
  });
}
async function transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await open();
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction;
    try { tx = database.transaction("packs", mode); }
    catch (cause) { database.close(); reject(cause); return; }
    const timer = setTimeout(() => { tx.abort(); }, 5000);
    const close = () => { clearTimeout(timer); database.close(); };
    tx.onabort = tx.onerror = () => { close(); reject(tx.error ?? new Error("Skin storage is unavailable.")); };
    try {
      const request = operation(tx.objectStore("packs"));
      tx.oncomplete = () => { close(); resolve(request.result); };
    } catch (cause) { tx.abort(); close(); reject(cause); }
  });
}
export const readSavedSkins = (): Promise<SkinRecord[]> => transaction("readonly", store => store.getAll(undefined, 20));
export const saveSkin = (record: SkinRecord) => transaction("readwrite", store => store.put(record));
export const deleteSkin = (id: string) => transaction("readwrite", store => store.delete(id));
