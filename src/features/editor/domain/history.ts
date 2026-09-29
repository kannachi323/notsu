import type { EditorDocument } from "./document";
import { readDocument } from "./document";
import { editDocument } from "./commands";
import type { EditorCommand } from "./commands";

const MAX_SNAPSHOTS = 100, MAX_CHARACTERS = 8_000_000;
/** Serialized history bounds retained memory and isolates snapshots from callers. */
export class EditorHistory {
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private current: string;
  constructor(document: EditorDocument) { this.current = JSON.stringify(readDocument(document)); }
  get document(): EditorDocument { return readDocument(JSON.parse(this.current)); }
  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
  apply(command: EditorCommand): EditorDocument {
    const next = JSON.stringify(editDocument(this.document, command));
    if (next !== this.current) { this.undoStack.push(this.current); this.redoStack = []; this.current = next; this.trim(); }
    return this.document;
  }
  undo(): EditorDocument {
    const previous = this.undoStack.pop(); if (previous !== undefined) { this.redoStack.push(this.current); this.current = previous; this.trim(); }
    return this.document;
  }
  redo(): EditorDocument {
    const next = this.redoStack.pop(); if (next !== undefined) { this.undoStack.push(this.current); this.current = next; this.trim(); }
    return this.document;
  }
  private trim() {
    const bound = (stack: string[]) => {
      let characters = stack.reduce((sum, snapshot) => sum + snapshot.length, 0);
      while (stack.length && (stack.length > MAX_SNAPSHOTS || characters > MAX_CHARACTERS)) characters -= stack.shift()!.length;
    };
    bound(this.undoStack); bound(this.redoStack);
  }
}
