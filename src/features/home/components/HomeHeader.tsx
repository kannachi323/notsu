import { Link } from "react-router";
import { NotsuMark, Icon } from "./Icon";
import { MusicDropdown } from "./MusicDropdown";

export function HomeHeader() {
  return <header className="notsu-header">
    <Link className="notsu-brand" to="/" aria-label="notsu home"><NotsuMark /><span>notsu</span></Link>
    <nav className="notsu-navigation" aria-label="Main navigation">
      <Link className="notsu-icon-button" to="/rhythm" aria-label="Play" title="Play"><Icon name="play" /></Link>
      <Link className="notsu-icon-button" to="/browse" aria-label="Browse" title="Browse"><Icon name="browse" /></Link>
      <Link className="notsu-icon-button" to="/editor" aria-label="Editor" title="Editor"><Icon name="editor" /></Link>
      <MusicDropdown />
    </nav>
    <div className="notsu-social" role="group" aria-label="Player and social">
      <button className="notsu-profile" type="button" title="Player profile — coming soon" aria-disabled="true"><Icon name="profile" /><span><strong>Player</strong><span>Unranked</span></span></button>
      <button className="notsu-icon-button" type="button" aria-label="Chat" title="Chat — coming soon" aria-disabled="true"><Icon name="chat" /></button>
      <button className="notsu-icon-button" type="button" aria-label="Friends" title="Friends — coming soon" aria-disabled="true"><Icon name="friends" /></button>
    </div>
  </header>;
}
