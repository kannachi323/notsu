import { useEffect, useLayoutEffect, useRef } from "react";
import { Link } from "react-router";
import { useRhythmGame } from "./useRhythmGame";
import { Playfield } from "./components/Playfield";
import { Results } from "./components/Results";
import { Setup } from "./components/Setup";
import { getSkin, skinVariables } from "./components/skins";

const seconds = (ms: number) => `${Math.floor(Math.max(0, ms) / 60_000)}:${String(Math.floor(Math.max(0, ms) / 1000) % 60).padStart(2, "0")}`;

export function RhythmScreen() {
  const game = useRhythmGame();
  const { view, chart } = game;
  useLayoutEffect(() => {
    for (const [name, value] of Object.entries(skinVariables(getSkin(game.settings.skinId)))) {
      document.documentElement.style.setProperty(name, value);
    }
  }, [game.settings.skinId]);
  const playing = ["countdown", "playing", "paused"].includes(view.phase);
  const retry = () => void game.retry();
  const pauseButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (view.phase === "paused") pauseButton.current?.focus(); }, [view.phase]);
  const feedback = view.feedback && view.timeMs - view.feedback.atMs < 550 ? view.feedback : null;

  return <main className={`app phase-${view.phase}`}>
    {view.phase !== "setup" && <header className="app-header"><div className="brand">notsu</div></header>}
    {view.phase === "setup" && <Setup settings={game.settings} updateSettings={game.updateSettings} fileName={game.fileName} loading={game.loading} error={game.error} chooseFile={game.chooseFile} start={game.start} />}
    {view.phase === "starting" && <div className="starting" role="status">Preparing audio…</div>}
    {playing && <section className="game-stage" aria-label="Rhythm gameplay">
      <div className="game-hud"><div><h1>{chart.title}</h1><p>{chart.artist}</p></div><div className="hud-right"><div><strong>{view.summary.accuracy.toFixed(1)}%</strong><span>accuracy</span></div><div><strong>{view.summary.combo}</strong><span>combo</span></div><button className="pause-button" onClick={game.pause} aria-label="Pause gameplay">Esc</button></div></div>
      <div className="canvas-wrap"><Playfield runtime={game.runtime} />
        {view.phase === "countdown" && <div className="countdown" role="status" aria-label="Countdown"><strong>{Math.min(2, Math.max(1, Math.ceil(-view.timeMs / 1000)))}</strong></div>}
        {view.phase === "playing" && <div className={`hit-feedback ${feedback?.grade === "Miss" || feedback?.grade === "Extra" ? "bad" : ""}`} aria-hidden="true"><strong>{feedback?.grade ?? ""}</strong><span>{feedback?.errorMs !== undefined ? `${Math.abs(feedback.errorMs).toFixed(0)} ms ${feedback.errorMs < 0 ? "early" : "late"}` : ""}</span></div>}
        {view.phase === "paused" && <div className="pause-overlay"><section aria-labelledby="pause-title"><h2 id="pause-title">Paused</h2><p>Retry starts from the beginning.</p><div className="actions"><button ref={pauseButton} className="primary" onClick={retry}>Retry</button><button className="quiet" onClick={game.exit}>Home</button></div></section></div>}
      </div>
      <div className="progress-area"><progress aria-label="Excerpt progress" value={Math.max(0, view.timeMs)} max={chart.durationMs} /><div><span>{seconds(view.timeMs)}</span><p>Any key to tap. Press and release holds on time.</p><span>{seconds(chart.durationMs)}</span></div></div>
    </section>}
    {view.phase === "results" && <Results summary={view.summary} title={chart.title} retry={retry} exit={game.exit} />}
    <footer className="app-footer">
      <Link className="rhythm-home-link" to="/">← notsu home</Link>
      <span>Unofficial community project · Not affiliated with ppy</span>
    </footer>
  </main>;
}
