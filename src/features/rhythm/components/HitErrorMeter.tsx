import { HIT_WINDOW_MS } from "../domain/rules";

/** Recent hit offsets on the judgement windows: early left, late right.
 * Newer ticks are brighter; it reads timing drift at a glance. */
export function HitErrorMeter({ errors }: { errors: readonly number[] }) {
  const position = (error: number) => `${50 + Math.max(-1, Math.min(1, error / HIT_WINDOW_MS)) * 50}%`;
  return <div className="hit-error-meter" aria-hidden="true">
    <span className="hit-error-zone zone-okay" />
    <span className="hit-error-zone zone-good" />
    <span className="hit-error-zone zone-perfect" />
    <span className="hit-error-centre" />
    {errors.map((error, index) => <i key={index} style={{ left: position(error), opacity: .25 + .75 * (index + 1) / errors.length }}
      className={Math.abs(error) <= 45 ? "zone-perfect" : Math.abs(error) <= 90 ? "zone-good" : "zone-okay"} />)}
  </div>;
}
