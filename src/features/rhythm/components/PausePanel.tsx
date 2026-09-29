import { useEffect, useRef } from "react";

export const keyLabel = (code: string) => code.replace(/^Key|^Digit/, "").replace(/^Numpad/, "Numpad ");

export function PausePanel({ rearming, requiredKeys, canResume, error, resume, cancel, retry, exit }: {
  rearming: boolean; requiredKeys: readonly string[]; canResume: boolean; error: string;
  resume: () => void; cancel: () => void; retry: () => void; exit: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => { panel.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, [rearming]);
  return <div className="pause-overlay"><section ref={panel} role="dialog" aria-modal="true" aria-labelledby="pause-title" aria-describedby="pause-help"
    onKeyDown={event => {
      if (event.key !== "Tab") return;
      const buttons = [...panel.current!.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
      const target = event.shiftKey ? buttons.at(-1) : buttons[0];
      if (document.activeElement === (event.shiftKey ? buttons[0] : buttons.at(-1))) { event.preventDefault(); target?.focus(); }
    }}>
    <h2 id="pause-title">{rearming ? "Re-grab your hold" : "Paused"}</h2>
    <p id="pause-help">{rearming
      ? "Hold the same keys again. The three-second count-in starts when you’re ready."
      : canResume ? "Resume from here with a three-second count-in. Resumed play is practice."
      : "Retry starts a fresh attempt from the beginning."}</p>
    {requiredKeys.length > 0 && <p className="hold-keys">Keep held: {requiredKeys.map(code => <kbd key={code}>{keyLabel(code)}</kbd>)}</p>}
    {error && <p role="alert" className="error-message">{error}</p>}
    <div className="actions">
      {rearming ? <button className="primary" onClick={cancel}>Cancel</button> : canResume && <button className="primary" onClick={resume}>Resume</button>}
      <button className={canResume ? "quiet" : "primary"} onClick={retry}>Retry</button>
      <button className="quiet" onClick={exit}>Home</button>
    </div>
  </section></div>;
}
