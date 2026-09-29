export function HowToPlay() {
  return <div className="help-panel">
    <section><span className="help-symbol tap-symbol" aria-hidden="true" /><div><h2>Tap</h2><p>Press any letter, number, punctuation key, or Space when the centre of an orb crosses the target ring.</p></div></section>
    <section><span className="help-symbol hold-symbol" aria-hidden="true" /><div><h2>Hold and release</h2><p>Press the solid head, keep that key down, and release when the hollow endpoint crosses the ring. Use another key for taps during the hold.</p></div></section>
    <section><kbd>F J</kbd><div><h2>Use both hands</h2><p>Alternate two comfortable keys for fast passages. F and J work well, but no specific keys or hands are required.</p></div></section>
    <section><kbd>Esc</kbd><div><h2>Pause</h2><p>Press Escape or switch away from the window. Retry starts from the beginning. In menus, Escape returns home.</p></div></section>
  </div>;
}
