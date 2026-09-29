import { useLayoutEffect, useState } from "react";
import { Link } from "react-router";
import { useRhythmGame } from "./useRhythmGame";
import type { LocalLevel } from "./useRhythmGame";
import { Playfield } from "./components/Playfield";
import { Results } from "./components/Results";
import { Setup } from "./components/Setup";
import { getSkin, skinVariables } from "./components/skins";
import { PausePanel, keyLabel } from "./components/PausePanel";
import { useRecordSave } from "../records/useRecordSave";
import { RecordSaveStatus } from "../records/components/RecordSaveStatus";
import "../records/records.css";
import { useSkinCatalog } from "../skins/useSkinCatalog";

const seconds = (ms: number) => `${Math.floor(Math.max(0, ms) / 60_000)}:${String(Math.floor(Math.max(0, ms) / 1000) % 60).padStart(2, "0")}`;

export function RhythmScreen({ preview, local }: { preview?: LocalLevel & { close: () => void }; local?: LocalLevel & { close: () => void } }) {
  const game = useRhythmGame(preview ? { ...preview, editor: true } : local);
  const [noFail, setNoFail] = useState(false);
  const recordSave = useRecordSave(game.completedRun, local?.recordSource);
  const skinRevision = useSkinCatalog(state => state.revision);
  const { view, chart } = game;
  useLayoutEffect(() => {
    for (const [name, value] of Object.entries(skinVariables(getSkin(game.settings.skinId)))) {
      document.documentElement.style.setProperty(name, value);
    }
  }, [game.settings.skinId, skinRevision]);
  const playing = ["countdown", "playing", "paused", "rearming", "resuming"].includes(view.phase);
  const retry = () => void game.retry();
  const feedback = view.feedback && view.timeMs - view.feedback.atMs < 550 ? view.feedback : null;
  const { mods } = game.runtime.current.session;
  const checkpoint = game.runtime.current.checkpoint;
  const practice = [mods.noFail && "No Fail", view.summary.assists.freezeMotion && "Frozen lines", view.summary.assists.resumed && "Resumed"].filter(Boolean);
  const runLabel = game.runtime.current.playback ? "Replay" : mods.autoplay ? "Autoplay" : practice.length ? `${practice.join(" · ")} · practice` : "Standard run";

  return <main className={`app phase-${view.phase}`}>
    {view.phase !== "setup" && <header className="app-header"><div className="brand">notsu</div></header>}
    {view.phase === "setup" && (preview ? <section className="editor-playtest-start">
      <p className="muted">Editor playtest · unranked</p><h1>{chart.title}</h1>
      <p>Try your map with any gameplay key. No Fail is on so you can check the entire arrangement.</p>
      <div className="actions"><button className="primary" onClick={() => void game.start("song", { noFail: true, autoplay: false })}>Start playtest</button>
        <button onClick={() => void game.start("song", { noFail: true, autoplay: true })}>Watch Autoplay</button><button onClick={preview.close}>Back to editor</button></div>
      {game.error && <p role="alert">{game.error}</p>}
    </section> : local ? <section className="editor-playtest-start"><p className="muted">{local.savedReplay ? "Saved replay · local, unranked" : "Local play · unranked"}</p><h1>{chart.title}</h1><p>{chart.artist}</p>
      <p>Press any gameplay key when a circle reaches its moving target. Hold notes need a press and release.</p>
      <label className="local-no-fail"><input type="checkbox" checked={noFail} onChange={event => setNoFail(event.target.checked)} /> No Fail · practice the whole map</label>
      <div className="actions">{local.savedReplay && <button onClick={() => void game.start("song", local.savedReplay!.mods, local.savedReplay)}>Watch saved replay</button>}<button className="primary" onClick={() => void game.start("song", { noFail, autoplay: false })}>Start playing</button><button onClick={() => void game.start("song", { noFail: true, autoplay: true })}>Watch Autoplay</button><button onClick={local.close}>Back to library</button></div>
      {game.error && <p role="alert">{game.error}</p>}
    </section> : <Setup settings={game.settings} updateSettings={game.updateSettings} fileName={game.fileName} loading={game.loading} error={game.error} chooseFile={game.chooseFile} start={game.start} />)}
    {view.phase === "starting" && <div className="starting" role="status">Preparing audio…</div>}
    {playing && <section className="game-stage" aria-label="Rhythm gameplay">
      <div className="game-hud"><div><h1>{chart.title}</h1><p>{chart.artist}</p><p className="run-label">{runLabel}</p></div><div className="hud-right"><div><strong>{view.summary.score.toLocaleString()}</strong><span>score</span></div><div><strong>{view.summary.accuracy.toFixed(1)}%</strong><span>accuracy</span></div><div><strong>{view.summary.combo}</strong><span>combo</span></div><button className="pause-button" onClick={game.pause} aria-label="Pause gameplay">Esc</button></div></div>
      <div className="health-bar"><label htmlFor="health">Health</label><meter id="health" min={0} max={100} low={25} optimum={100} value={view.summary.health}>{view.summary.health}%</meter></div>
      <div className="canvas-wrap"><Playfield runtime={game.runtime} />
        {["countdown", "resuming"].includes(view.phase) && <div className="countdown" role="status" aria-label="Countdown">
          <strong>{view.countdown}</strong>
          {view.phase === "resuming" && <span>{checkpoint?.requiredKeys.length ? `Keep ${checkpoint.requiredKeys.map(keyLabel).join(" + ")} held` : "Ready to continue"}</span>}
        </div>}
        {view.phase === "playing" && <div className={`hit-feedback ${feedback?.grade === "Miss" || feedback?.grade === "Extra" ? "bad" : ""}`} aria-hidden="true"><strong>{feedback?.grade ?? ""}</strong><span>{feedback?.errorMs !== undefined ? `${Math.abs(feedback.errorMs).toFixed(0)} ms ${feedback.errorMs < 0 ? "early" : "late"}` : ""}</span></div>}
        {["paused", "rearming"].includes(view.phase) && <PausePanel rearming={view.phase === "rearming"} requiredKeys={checkpoint?.requiredKeys ?? []}
          canResume={!!checkpoint && view.summary.status === "playing"} error={game.error} resume={() => void game.resume()} cancel={game.pause} retry={retry} exit={game.exit} />}
      </div>
      <div className="progress-area"><progress aria-label="Excerpt progress" value={Math.max(0, view.timeMs)} max={chart.durationMs} /><div><span>{seconds(view.timeMs)}</span><p>Any key to tap. Press and release holds on time.</p><span>{seconds(chart.durationMs)}</span></div></div>
    </section>}
    {view.phase === "results" && <Results summary={view.summary} title={chart.title} retry={retry} exit={game.exit} runLabel={local ? `${runLabel} · local, unranked` : runLabel} exitLabel={preview || local ? "Back to setup" : "Home"}
      retryLabel={game.runtime.current.playback ? "Watch again" : "Play again"}
      recordStatus={<>{game.error && <p role="alert">{game.error}</p>}{game.runtime.current.playback ? <p className="record-help">Replay playback · no new attempt saved</p> : <RecordSaveStatus state={recordSave.state} retry={recordSave.retry} />}</>}
      watchReplay={game.hasReplay && !game.runtime.current.playback ? () => void game.watchReplay() : undefined} />}
    <footer className="app-footer">
      {preview ? <button className="quiet" onClick={preview.close}>← Back to editor</button> : local ? <button className="quiet" onClick={local.close}>← Back to library</button> : <Link className="rhythm-home-link" to="/">← notsu home</Link>}
      <span>Unofficial community project · Not affiliated with ppy</span>
    </footer>
  </main>;
}
