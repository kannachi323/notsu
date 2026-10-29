import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { Summary } from "../domain/session";

export function Results({ summary,title,retry,exit,runLabel,watchReplay,recordStatus,retryLabel="Play again",exitLabel="Home" }: {
  summary:Summary; title:string; retry:()=>void; exit:()=>void; runLabel:string; watchReplay?:()=>void; exitLabel?:string; recordStatus?:ReactNode; retryLabel?:string;
}) {
  const retryButton = useRef<HTMLButtonElement>(null);
  useEffect(()=>{ retryButton.current?.focus(); },[]);
  useEffect(()=>{ const back=(event:KeyboardEvent)=>{ if (event.key==="Escape" && !event.defaultPrevented) { event.preventDefault(); exit(); } };
    window.addEventListener("keydown",back); return ()=>window.removeEventListener("keydown",back);
  },[exit]);
  return <section className={`results-panel ${summary.status==="failed" ? "result-failed" : ""}`} aria-labelledby="results-title">
    <header className="result-heading"><div><p className="result-run-label">{runLabel}</p><h1 id="results-title">{summary.status==="failed" ? "Keep the rhythm going" : "Map complete"}</h1><p className="result-track">{title}</p></div><span className="result-finish-symbol" aria-hidden="true">{summary.status==="failed" ? "↺" : "◈"}</span></header>
    {summary.status==="failed" && <p className="result-failure-note">Health reached zero. Try No Fail to learn the rest of the map.</p>}
    <div className="result-performance"><div className="result-total"><span>Total score</span><p className="result-score">{summary.score.toLocaleString()}<small> / 1,000,000</small></p><div className="result-completion"><progress aria-label="Judgements completed" value={summary.judged} max={Math.max(1,summary.expected)}/><span>{summary.judged} / {summary.expected} judgements</span></div></div>
      <div className="results-main"><div className="result-accuracy">{summary.accuracy.toFixed(2)}<span>%</span><small>Accuracy</small></div><div><strong>{summary.maxCombo}<small>×</small></strong><span>Best combo</span></div></div>
    </div>
    <dl className="judgements">{Object.entries(summary.counts).map(([grade,count])=><div key={grade} className={`result-judgement result-${grade.toLowerCase()}`}><dt>{grade}</dt><dd>{count}</dd><progress aria-label={`${grade} judgements`} value={count} max={Math.max(1,summary.judged)}/></div>)}<div className="result-judgement result-extra"><dt>Extra presses</dt><dd>{summary.extra}</dd></div></dl>
    <div className="result-timing">{summary.meanErrorMs!==null && <p className="timing-result">Average timing <strong>{Math.abs(summary.meanErrorMs).toFixed(0)} ms {summary.meanErrorMs<0 ? "early" : "late"}</strong></p>}<p className="result-rules-note">Holds count as press and release. Extra presses lower accuracy.</p></div>
    <div className="result-save-state">{recordStatus}</div>
    <div className="actions result-actions"><button className="quiet result-exit" onClick={exit}>← {exitLabel}</button>{watchReplay && <button className="quiet" onClick={watchReplay}>▷ Watch replay</button>}<button ref={retryButton} className="primary" onClick={retry}>↺ {retryLabel}</button></div>
  </section>;
}
