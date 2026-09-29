import type { EditorDocument } from "../domain/document";
import type { EditorCommand } from "../domain/commands";
export function MapDetails({ document, change }: { document: EditorDocument; change: (command: EditorCommand) => void }) {
  return <details className="editor-details"><summary>Song &amp; difficulty</summary>
    <form key={[document.chart.title, document.chart.artist, document.author, document.difficulty].join("\0")} onSubmit={event => {
      event.preventDefault(); const values = new FormData(event.currentTarget);
      change({ type: "metadata", title: String(values.get("title")), artist: String(values.get("artist")), author: String(values.get("author")), difficulty: String(values.get("difficulty")) });
    }}><div className="editor-field-grid">
      <label>Title<input name="title" defaultValue={document.chart.title} maxLength={256} required /></label>
      <label>Artist<input name="artist" defaultValue={document.chart.artist} maxLength={256} required /></label>
      <label>Mapper<input name="author" defaultValue={document.author} maxLength={256} required /></label>
      <label>Difficulty<input name="difficulty" defaultValue={document.difficulty} maxLength={256} required /></label>
    </div><button type="submit">Apply details</button></form>
  </details>;
}
