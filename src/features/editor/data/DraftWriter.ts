import type { EditorDocument } from "../domain/document";
import { saveDraft } from "./storage";

/** Serializes autosaves and coalesces edits arriving during a write. */
export class DraftWriter {
  private pending: EditorDocument | undefined;
  private running: Promise<void> | undefined;
  private failure: Error | undefined;
  constructor(private revision: number, private write = saveDraft) {}
  enqueue(document: EditorDocument) { this.pending = document; }
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
      try { this.revision = (await this.write(document, this.revision)).revision; }
      catch (cause) { this.failure = cause instanceof Error ? cause : new Error("Autosave failed."); this.pending ??= document; throw this.failure; }
    }
  }
}
