import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { Summary } from "../domain/session";
import type { Grade } from "../domain/rules";
import { HIT_WINDOW_MS } from "../domain/rules";
import { Button, CoverArt, Icon } from "../../../shared/components";
import { isPerfect, letterGrade, timingHistogram } from "./grade";

const GRADES: readonly Grade[] = ["Perfect", "Good", "Okay", "Miss"];
const BINS = 14;

function AccuracyRing({ accuracy, grade, perfect }: { accuracy: number; grade: string; perfect: boolean }) {
  const radius = 54, circumference = 2 * Math.PI * radius;
  return <div className={`result-grade grade-${grade.toLowerCase()} ${perfect ? "is-perfect" : ""}`}>
    <svg viewBox="0 0 128 128" aria-hidden="true">
      <circle className="result-grade-track" cx="64" cy="64" r={radius} />
      <circle className="result-grade-fill" cx="64" cy="64" r={radius} strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - Math.min(100, accuracy) / 100)} />
    </svg>
    <strong aria-label={`Grade ${grade}${perfect ? ", perfect" : ""}`}>{grade}</strong>
    {perfect && <span className="result-grade-star" aria-hidden="true"><Icon name="star" /></span>}
  </div>;
}

function TimingHistogram({ errors }: { errors: readonly number[] }) {
  const bins = timingHistogram(errors, HIT_WINDOW_MS, BINS), peak = Math.max(1, ...bins);
  const width = HIT_WINDOW_MS * 2 / BINS;
  return <figure className="result-histogram">
    <div className="result-histogram-bars" role="img" aria-label={`Timing spread of ${errors.length} hits, early on the left and late on the right`}>
      {bins.map((count, index) => {
        const centre = Math.abs(-HIT_WINDOW_MS + (index + .5) * width);
        const zone = centre <= 45 ? "perfect" : centre <= 90 ? "good" : "okay";
        return <span key={index} className={`zone-${zone}`} style={{ height: `${Math.max(count ? 8 : 2, count / peak * 100)}%` }} />;
      })}
    </div>
    <figcaption><span>Early</span><span>Late</span></figcaption>
  </figure>;
}

export function Results({ summary,title,artist,artSeed,hitErrors,retry,exit,runLabel,watchReplay,recordStatus,retryLabel="Play again",exitLabel="Home" }: {
  summary:Summary; title:string; artist?:string; artSeed?:string; hitErrors:readonly number[]; retry:()=>void; exit:()=>void; runLabel:string;
  watchReplay?:()=>void; exitLabel?:string; recordStatus?:ReactNode; retryLabel?:string;
}) {
  const retryButton = useRef<HTMLButtonElement>(null);
  useEffect(()=>{ retryButton.current?.focus(); },[]);
  useEffect(()=>{ const back=(event:KeyboardEvent)=>{ if (event.key==="Escape" && !event.defaultPrevented) { event.preventDefault(); exit(); } };
    window.addEventListener("keydown",back); return ()=>window.removeEventListener("keydown",back);
  },[exit]);
  const grade = letterGrade(summary), failed = summary.status === "failed";
  const total = Math.max(1, summary.judged + summary.extra);
  const timing = summary.meanErrorMs === null ? "—" : Math.abs(summary.meanErrorMs) < .5 ? "On time"
    : `${Math.abs(summary.meanErrorMs).toFixed(0)} ms ${summary.meanErrorMs < 0 ? "early" : "late"}`;
  return <section className={`results-panel ${failed ? "result-failed" : ""}`} aria-labelledby="results-title">
    <header className="result-banner">
      <CoverArt seed={artSeed ?? title} className="result-banner-art" />
      <div className="result-banner-copy">
        <p className="result-run-label">{runLabel}</p>
        <h1 id="results-title">{title}</h1>
        {artist && <p className="result-track">{artist}</p>}
      </div>
      <p className="result-outcome">{failed ? "Failed" : "Cleared"}</p>
    </header>

    <div className="result-performance">
      <AccuracyRing accuracy={summary.accuracy} grade={grade} perfect={isPerfect(summary)} />
      <div className="result-total">
        <p className="result-score">{summary.score.toLocaleString()}</p>
        <dl className="result-stats">
          <div><dt>Accuracy</dt><dd>{summary.accuracy.toFixed(2)}<small>%</small></dd></div>
          <div><dt>Max combo</dt><dd>{summary.maxCombo}<small>×</small></dd></div>
          <div><dt>Timing</dt><dd>{timing}</dd></div>
        </dl>
      </div>
    </div>

    <div className="result-breakdown">
      <div>
        <div className="result-distribution" role="img" aria-label={GRADES.map(g => `${summary.counts[g]} ${g}`).join(", ") + `, ${summary.extra} extra`}>
          {GRADES.map(g => summary.counts[g] ? <span key={g} className={`result-${g.toLowerCase()}`} style={{ flexGrow: summary.counts[g] / total }} /> : null)}
          {summary.extra ? <span className="result-extra" style={{ flexGrow: summary.extra / total }} /> : null}
        </div>
        <dl className="judgements">
          {GRADES.map(g => <div key={g} className={`result-judgement result-${g.toLowerCase()}`}><dt>{g}</dt><dd>{summary.counts[g]}</dd></div>)}
          <div className="result-judgement result-extra"><dt>Extra</dt><dd>{summary.extra}</dd></div>
        </dl>
      </div>
      <TimingHistogram errors={hitErrors} />
    </div>

    <div className="result-save-state">{recordStatus}</div>
    <div className="result-actions">
      <Button variant="ghost" className="result-exit" icon={<Icon name="back" />} onClick={exit}>{exitLabel}</Button>
      {watchReplay && <Button icon={<Icon name="play" />} onClick={watchReplay}>Watch replay</Button>}
      <Button ref={retryButton} variant="primary" sheared icon={<Icon name="refresh" />} onClick={retry}>{retryLabel}</Button>
    </div>
  </section>;
}
