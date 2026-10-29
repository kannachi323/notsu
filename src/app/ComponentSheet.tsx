import { useState } from "react";
import { AppScreen } from "../features/home/components/AppScreen";
import {
  Avatar, Badge, Button, ButtonLink, Checkbox, Cluster, Dialog, EmptyState, Field, FooterButton, Icon, IconButton, List, ListItem,
  Loading, Notice, Page, PageHeader, Panel, ScreenFooter, SectionHeader, Slider, StatList, TabLinks, Tabs,
} from "../shared/components";
import type { IconName } from "../shared/components";
import "./component-sheet.css";

const surfaces = ["canvas", "surface-1", "surface-2", "surface-3", "surface-4", "input-bg"];
const brand = ["accent", "accent-strong", "accent-surface", "violet", "violet-strong", "pink", "pink-strong"];
const status = ["success", "warning", "danger", "success-surface", "warning-surface", "danger-surface"];
const text = ["text", "text-2", "text-3", "text-disabled"];
const spaces = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16];
const type = ["display", "4xl", "3xl", "2xl", "xl", "lg", "md", "sm", "xs"];
const icons: IconName[] = ["play", "browse", "editor", "settings", "music", "profile", "chat", "friends", "search", "plus", "refresh", "star",
  "shuffle", "upload", "download", "external", "info", "alert", "check", "mods", "pause", "start", "home", "trash", "flag", "back", "forward", "close", "volume"];

/** Development-only reference for tokens and shared components (#/ui). */
export function ComponentSheet() {
  const [tab, setTab] = useState<"one" | "two" | "three">("one"), [mode, setMode] = useState<"hidden" | "friends">("friends");
  const [dialog, setDialog] = useState(false), [toggle, setToggle] = useState(true), [check, setCheck] = useState(false), [volume, setVolume] = useState(.6);
  return <AppScreen><Page width="wide">
    <PageHeader back={{ to: "/", label: "Home" }} icon="mods" eyebrow="Development" title="Interface sheet"
      description="Design tokens and every shared component. Build new screens from these pieces."
      actions={<><Button icon={<Icon name="refresh" />}>Secondary</Button><Button variant="primary" icon={<Icon name="plus" />}>Primary action</Button></>}>
      <Tabs label="Example tabs" items={[{ value: "one", label: "Overview" }, { value: "two", label: "Activity", count: 4 }, { value: "three", label: "Settings" }]} value={tab} onChange={setTab} />
    </PageHeader>

    <SectionHeader title="Colour" description="Surfaces share one hue ramp; change --ui-hue to retint everything." />
    {[["Surfaces", surfaces], ["Brand", brand], ["Status", status], ["Text", text]].map(([label, names]) =>
      <div key={label as string} className="sheet-swatches" aria-label={label as string}>
        {(names as string[]).map(name => <figure key={name}><span style={{ background: `var(--ui-${name})` }} /><figcaption>--ui-{name}</figcaption></figure>)}
      </div>)}

    <div className="ui-columns">
      <Panel title="Spacing" description="A 4px grid. Pages use --ui-gutter horizontally and --ui-section-gap between sections.">
        {spaces.map(step => <div key={step} className="sheet-space"><code>--ui-space-{step}</code><span style={{ width: `var(--ui-space-${step})` }} /></div>)}
      </Panel>
      <Panel title="Type scale" description="Body text is 15px. Nothing goes below 12px.">
        {type.map(size => <p key={size} className="sheet-type" style={{ fontSize: `var(--ui-text-${size})` }}>{size} · Every beat</p>)}
      </Panel>
    </div>

    <SectionHeader title="Buttons" />
    <Panel>
      <Cluster><Button variant="primary">Primary</Button><Button>Secondary</Button><Button variant="outline">Outline</Button><Button variant="ghost">Ghost</Button><Button variant="danger">Danger</Button><Button disabled>Disabled</Button></Cluster>
      <Cluster><Button size="sm" icon={<Icon name="star" />}>Small</Button><Button icon={<Icon name="download" />}>Medium</Button><Button size="lg" variant="primary" icon={<Icon name="play" />}>Large</Button><Button aria-pressed>Pressed</Button></Cluster>
      <Cluster><Button sheared variant="primary" icon={<Icon name="play" />}>Sheared</Button><Button sheared>Sheared secondary</Button><ButtonLink to="/ui" variant="outline" icon={<Icon name="external" />}>Button link</ButtonLink>
        <IconButton label="Refresh" icon={<Icon name="refresh" />} /><IconButton variant="secondary" label="Settings" icon={<Icon name="settings" />} /><IconButton variant="primary" size="lg" label="Play" icon={<Icon name="play" />} /></Cluster>
    </Panel>

    <div className="ui-columns">
      <Panel title="Form controls" description="Labels sit inside the field. Hints and errors are announced with the control.">
        <form className="ui-form" onSubmit={event => event.preventDefault()}>
          <Field label="Username" hint="3–20 letters, numbers or underscores."><input defaultValue="rhythm_mapper" /></Field>
          <Field label="Email" error="Enter a valid email address."><input type="email" defaultValue="not-an-email" /></Field>
          <Field label="Sort"><select defaultValue="recent"><option value="recent">Date added</option><option value="title">Title</option></select></Field>
          <Field label="Bio"><textarea rows={3} defaultValue="Lines that move to the music." /></Field>
          <Checkbox label="Remember this device" checked={check} onChange={event => setCheck(event.target.checked)} />
          <Checkbox toggle label="Reduced motion" description="Use static hit effects." checked={toggle} onChange={event => setToggle(event.target.checked)} />
          <Slider label="Music volume" valueText={`${Math.round(volume * 100)}%`} min="0" max="1" step=".05" value={volume} onChange={event => setVolume(Number(event.target.value))} />
          <Tabs variant="segmented" label="Visibility" items={[{ value: "hidden", label: "Hidden" }, { value: "friends", label: "Friends only" }]} value={mode} onChange={setMode} />
        </form>
      </Panel>
      <div className="ui-stack ui-stack--lg">
        <Panel title="Feedback">
          <Notice>Live updates connected.</Notice>
          <Notice tone="success" title="Profile saved">Your changes are public now.</Notice>
          <Notice tone="warning" title="Leave without saving?" actions={<><Button size="sm">Keep editing</Button><Button size="sm" variant="danger">Discard</Button></>} />
          <Notice tone="danger">Delivery could not be confirmed.</Notice>
          <Loading>Loading maps…</Loading>
          <Cluster><Badge>Neutral</Badge><Badge tone="accent">Included</Badge><Badge tone="violet">Community</Badge><Badge tone="success">Public</Badge><Badge tone="warning">Awaiting review</Badge><Badge tone="danger">Hidden</Badge></Cluster>
        </Panel>
        <Panel title="Panel variants" actions={<Button size="sm" onClick={() => setDialog(true)}>Open dialog</Button>}>
          <Panel variant="raised" title="Raised" headingLevel={3}><p className="ui-text-muted">Nested content surface.</p></Panel>
          <Panel variant="outline" title="Outline" headingLevel={3}><p className="ui-text-muted">For optional or quiet groups.</p></Panel>
          <Panel variant="accent" title="Accent" headingLevel={3}><p className="ui-text-muted">Highlights the current selection.</p></Panel>
        </Panel>
      </div>
    </div>

    <div className="ui-columns">
      <Panel title="Data display">
        <Cluster><Avatar name="Pulse Weaver" size="sm" /><Avatar name="Phase Runner" /><Avatar name="Orbit" size="lg" /><Avatar name="Violet" size="xl" /></Cluster>
        <StatList items={[{ label: "Length", value: "0:32" }, { label: "BPM", value: 120 }, { label: "Circles", value: 24 }, { label: "Lines", value: 4 }]} />
        <List label="Example list">
          <ListItem leading={<Avatar name="Pulse Weaver" />} title="Pulse Weaver" subtitle="@pulse_weaver" meta={<Badge tone="success">Online</Badge>} actions={<Button size="sm" variant="primary">Message</Button>} />
          <ListItem leading={<Avatar name="Phase Runner" />} title="Phase Runner" subtitle="@phase_runner" actions={<Button size="sm">Remove friend</Button>} />
        </List>
      </Panel>
      <div className="ui-stack ui-stack--lg">
        <EmptyState title="No matching maps" description="Try another search or clear the filters." action={<Button>Show all maps</Button>} />
        <Panel title="Navigation tabs"><TabLinks label="Example route tabs" items={[{ to: "/ui", label: "This sheet", current: true }, { to: "/", label: "Home", current: false }]} /></Panel>
      </div>
    </div>

    <SectionHeader title="Icons" />
    <Panel><div className="sheet-icons">{icons.map(name => <figure key={name}><Icon name={name} /><figcaption>{name}</figcaption></figure>)}</div></Panel>

    <SectionHeader title="Screen footer" description="Game screens such as song selection end with this bar." />
    <div className="sheet-footer">
      <ScreenFooter back={{ to: "/" }}>
        <FooterButton tone="pink" icon={<Icon name="mods" />} label="Mods" />
        <FooterButton tone="violet" icon={<Icon name="shuffle" />} label="Random" shortcut="F2" />
        <FooterButton tone="neutral" icon={<Icon name="music" />} label="Preview" />
      </ScreenFooter>
    </div>

    <Dialog open={dialog} onClose={() => setDialog(false)} eyebrow="Play your way" title="Example dialog"
      footer={<><Button variant="ghost" onClick={() => setDialog(false)}>Cancel</Button><Button variant="primary" onClick={() => setDialog(false)}>Done</Button></>}>
      <p className="ui-text-muted">Native dialog with focus containment, Escape and backdrop dismissal.</p>
    </Dialog>
  </Page></AppScreen>;
}
