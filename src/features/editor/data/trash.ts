import { guarded, transaction } from "./database";
import { DraftConflict, sameVersion, savedRow, summarize } from "./storage";
import type { DraftSummary, DraftVersion, SavedDraft } from "./storage";

type TrashEntry = { id: string; row: SavedDraft; token: string; trashedAt: number };
export type TrashedDraft = DraftSummary & { token: string; trashedAt: number };
export const listTrash = (): Promise<TrashedDraft[]> => transaction("readonly", (tx, result) => {
  const rows: TrashedDraft[] = [], request = tx.objectStore("trash").openCursor();
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) { result(rows.sort((a, b) => b.trashedAt - a.trashedAt)); return; }
    const entry = cursor.value as TrashEntry;
    rows.push({ ...summarize(entry.row, String(cursor.key)), token: entry.token, trashedAt: entry.trashedAt }); cursor.continue();
  };
});
export const trashDraft = (id: string, version: DraftVersion): Promise<void> => transaction("readwrite", (tx, result, fail) => {
  const drafts = tx.objectStore("drafts"), request = drafts.get(id);
  request.onsuccess = guarded(fail, () => {
    if (!request.result || !sameVersion(request.result, version)) throw new DraftConflict();
    const entry: TrashEntry = { id, row: savedRow(request.result, id), token: crypto.randomUUID(), trashedAt: Date.now() };
    tx.objectStore("trash").add(entry); drafts.delete(id); result(undefined);
  });
});
export const restoreDraft = (id: string, token: string): Promise<void> => transaction("readwrite", (tx, result, fail) => {
  const trash = tx.objectStore("trash"), request = trash.get(id);
  request.onsuccess = guarded(fail, () => {
    const entry = request.result as TrashEntry | undefined;
    if (!entry || entry.token !== token) throw new DraftConflict();
    const row = savedRow(entry.row, id);
    // Change the lifetime token too: a window left open before Trash must never resume saving over the restoration.
    tx.objectStore("drafts").add({ ...row, revision: row.revision + 1, incarnation: crypto.randomUUID(), updatedAt: Date.now() });
    trash.delete(id); result(undefined);
  });
});
/** Explicit permanent removal. Song collection shares this transaction with every draft change. */
export const purgeDraft = (id: string, token: string): Promise<void> => transaction("readwrite", (tx, result, fail) => {
  const trash = tx.objectStore("trash"), request = trash.get(id);
  request.onsuccess = guarded(fail, () => {
    const entry = request.result as TrashEntry | undefined;
    if (!entry || entry.token !== token) throw new DraftConflict();
    trash.delete(id);
    const references = new Set<string>(); let unknownReference = false, scanned = 0;
    for (const store of ["drafts", "trash"]) {
      const scan = tx.objectStore(store).openCursor();
      scan.onsuccess = guarded(fail, () => {
        const cursor = scan.result;
        if (cursor) {
          const hash = (store === "trash" ? cursor.value.row : cursor.value)?.document?.song?.sha256;
          if (typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash)) references.add(hash);
          else unknownReference = true; // Damaged data might still need a song; never guess which one.
          cursor.continue(); return;
        }
        if (++scanned < 2) return;
        if (unknownReference) { result(undefined); return; }
        const songs = tx.objectStore("songs").openCursor();
        songs.onsuccess = guarded(fail, () => {
          const song = songs.result;
          if (!song) { result(undefined); return; }
          if (!references.has(String(song.key))) song.delete();
          song.continue();
        });
      });
    }
  });
});
