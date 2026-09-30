import type { EditorPlayback } from "../data/EditorTransport";

export function PlaybackControls({ options, change, playing, remaining }: {
  options: EditorPlayback; change: (options: EditorPlayback) => void; playing: boolean; remaining: number;
}) {
  return <section className="editor-playback" aria-label="Listening tools">
    <label className="editor-metronome-toggle"><input type="checkbox" checked={options.metronome} onChange={event => change({ ...options, metronome: event.target.checked })} />Metronome</label>
    <label className="editor-count-in">Count-in<select value={options.countInBeats} onChange={event => change({ ...options, countInBeats: Number(event.target.value) as EditorPlayback["countInBeats"] })}>
      <option value={0}>Off</option><option value={2}>2 beats</option><option value={4}>4 beats</option>
    </select></label>
    <p className="editor-listening-status" role="status">{playing ? remaining ? `Count-in · ${remaining} ${remaining === 1 ? "beat" : "beats"} remaining` : "Listening" : "Paused"}</p>
    <details><summary>Playback sound</summary><div className="editor-playback-volumes">
      <label>Song volume · {Math.round(options.musicVolume * 100)}%<input aria-label="Editor song volume" type="range" min={0} max={100} step={1} value={Math.round(options.musicVolume * 100)} onChange={event => change({ ...options, musicVolume: Number(event.target.value) / 100 })} /></label>
      <label>Click volume · {Math.round(options.clickVolume * 100)}%<input aria-label="Metronome and count-in volume" type="range" min={0} max={100} step={1} value={Math.round(options.clickVolume * 100)} onChange={event => change({ ...options, clickVolume: Number(event.target.value) / 100 })} /></label>
    </div></details>
    <p className="editor-hint">Clicks follow quarter-note beats and tempo changes. Count-in uses the playhead’s tempo, even with the metronome off. Changing count-in pauses listening.</p>
  </section>;
}
