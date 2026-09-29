import { Icon } from "./Icon";

export function HomeUpdates() {
  return <section className="notsu-updates" aria-labelledby="updates-title">
    <button className="notsu-icon-button" type="button" aria-label="Previous update" aria-disabled="true"><Icon name="back" /></button>
    <div className="notsu-update-card">
      <svg className="notsu-update-art" viewBox="0 0 100 64" fill="none" aria-hidden="true" focusable="false">
        <path d="m5 59 88-53" stroke="#69777b" />
        <g fill="var(--home-accent)"><circle cx="18" cy="51" r="5" /><circle cx="40" cy="38" r="6" /><circle cx="62" cy="25" r="5" /><circle cx="83" cy="12" r="4" /></g>
      </svg>
      <div className="notsu-update-copy"><span>Updates</span><h2 id="updates-title">New rhythms and practice drills</h2></div>
      <button className="notsu-read-more" type="button" aria-disabled="true">Read more</button>
    </div>
    <button className="notsu-icon-button" type="button" aria-label="Next update" aria-disabled="true"><Icon name="forward" /></button>
  </section>;
}
