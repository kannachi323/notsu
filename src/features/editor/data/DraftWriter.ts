import type { EditorDocument } from "../domain/document";
import { DraftConflict, saveDraft } from "./storage";
import type { DraftVersion } from "./storage";

/** Serializes autosaves and coalesces edits arriving during a write. */
export class DraftWriter {
  private pending: EditorDocument | undefined;
  private running: Promise<void> | undefined;
  private failure: Error | undefined;
  constructor(private version: DraftVersion, private write = saveDraft) {}
  enqueue(document: EditorDocument) { this.pending = document; }
  get error() { return this.failure; }
  async retry() {
    if (this.running) return this.running;
    if (this.failure instanceof DraftConflict) throw this.failure;
    this.failure = undefined;
    return this.flush();
  }
  get dirty() { return !!this.pending || !!this.running || !!this.failure; }
  async flush(): Promise<void> {
    if (this.failure) throw this.failure;
    if (this.running) return this.running;
    this.running = this.drain();
    try { await this.running; } finally { this.running = undefined; }
  }
  private async drain() {
    while (this.pending) {
      const document = this.pending; this.pending = undefined;
      try { this.version = await this.write(document, this.version); }
      catch (cause) { this.failure = cause instanceof Error ? cause : new Error("Autosave failed."); this.pending ??= document; throw this.failure; }
    }
  }
}
