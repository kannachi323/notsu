import { useEffect, useRef } from "react";
import type { Summary } from "../domain/session";

export function Results({ summary, title, retry, exit, runLabel, watchReplay, exitLabel = "Home" }: {
  summary: Summary; title: string; retry: () => void; exit: () => void; runLabel: string; watchReplay?: () => void; exitLabel?: string;
}) {
  const retryButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { retryButton.current?.focus(); }, []);
  return <section className="results-panel" aria-labelledby="results-title">
    <h1 id="results-title">{summary.status === "failed" ? "Try again" : "Results"}</h1>
    <p className="muted">{title} · {runLabel}</p>
    {summary.status === "failed" && <p>Health reached zero. Try No Fail to learn the rest of the chart.</p>}
    <p className="result-score">{summary.score.toLocaleString()} <span>points</span></p>
    <div className="results-main"><div className="result-accuracy">{summary.accuracy.toFixed(2)}<span>%</span></div><div><strong>{summary.maxCombo}</strong><span>best combo</span></div></div>
    <dl className="judgements">{Object.entries(summary.counts).map(([grade, count]) => <div key={grade}><dt>{grade}</dt><dd>{count}</dd></div>)}<div><dt>Extra presses</dt><dd>{summary.extra}</dd></div></dl>
    <p className="small muted">Holds count as two judgements: press and release. Extra presses lower accuracy.</p>
    {summary.meanErrorMs !== null && <p className="timing-result">Average timing: <strong>{Math.abs(summary.meanErrorMs).toFixed(0)} ms {summary.meanErrorMs < 0 ? "early" : "late"}</strong></p>}
    <div className="actions"><button ref={retryButton} className="primary" onClick={retry}>Play again</button>{watchReplay && <button className="quiet" onClick={watchReplay}>Watch replay</button>}<button className="quiet" onClick={exit}>{exitLabel}</button></div>
  </section>;
}
