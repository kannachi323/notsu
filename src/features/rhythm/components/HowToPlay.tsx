import { Icon } from "../../../shared/components";

const tips = [
  { art: <span className="help-symbol tap-symbol" />, title: "Tap", text: "Any key as the orb meets the ring." },
  { art: <span className="help-symbol hold-symbol" />, title: "Hold", text: "Press the head, release at the hollow end." },
  { art: <span className="help-shared"><span className="help-symbol tap-symbol" /><span className="help-symbol tap-symbol" /></span>, title: "Shared hits", text: "Circles arriving together are one press." },
  { art: <span className="help-keys"><kbd>F</kbd><kbd>J</kbd></span>, title: "Two hands", text: "Alternate keys or controller buttons." },
  { art: <span className="help-icon"><Icon name="alert" /></span>, title: "Stay in rhythm", text: "Misses and extra presses cost health." },
  { art: <span className="help-keys"><kbd>Esc</kbd></span>, title: "Pause", text: "Resume with a three-second count-in." },
];

export function HowToPlay() {
  return <ul className="help-panel">
    {tips.map(tip => <li key={tip.title}><span className="help-art" aria-hidden="true">{tip.art}</span><h2>{tip.title}</h2><p>{tip.text}</p></li>)}
  </ul>;
}
