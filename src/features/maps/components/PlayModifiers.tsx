import { useState } from "react";
import type { Mods } from "../../rhythm/domain/rules";
import { Button, Dialog, FooterButton, Icon } from "../../../shared/components";

const modifiers = [
  { key: "noFail", icon: "heart", title: "No Fail", detail: "Keep playing when health reaches zero." },
  { key: "autoplay", icon: "eye", title: "Autoplay", detail: "Watch every note and movement." },
] as const;

export function PlayModifiers({ mods, change, busy }: { mods:Mods; change:(mods:Mods)=>void; busy:boolean }) {
  const [open, setOpen] = useState(false);
  const count = Number(mods.noFail) + Number(mods.autoplay);
  return <>
    <FooterButton tone="pink" icon={<Icon name="mods" />} label={`Mods${count ? ` (${count})` : ""}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} />
    <Dialog open={open} onClose={() => setOpen(false)} eyebrow="Play your way" title="Modifiers"
      footer={<><Button variant="ghost" disabled={busy || !count} onClick={() => change({ noFail:false,autoplay:false })}>Reset</Button><Button variant="primary" onClick={() => setOpen(false)}>Done</Button></>}>
      <p className="ui-text-muted ui-text-small">Practice only. Unranked.</p>
      <div className="mod-grid">
        {modifiers.map(mod => <label key={mod.key} className="mod-card">
          <input type="checkbox" disabled={busy} checked={mods[mod.key]} onChange={event => change({ ...mods, [mod.key]: event.target.checked })} />
          <span className="mod-card-icon" aria-hidden="true"><Icon name={mod.icon} /></span>
          <span className="mod-card-copy"><strong>{mod.title}</strong><small>{mod.detail}</small></span>
        </label>)}
      </div>
    </Dialog>
  </>;
}
