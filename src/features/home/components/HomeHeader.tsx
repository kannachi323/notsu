import { MusicDropdown } from "./MusicDropdown";
import { Link, NavLink } from "react-router";
import { Avatar, Icon, NotsuMark } from "../../../shared/components";
import { useAccountStore } from "../../accounts/accountStore";
import { onlineAvailable } from "../../accounts/data/availability";

export function HomeHeader() {
  const profile = useAccountStore(state => state.profile);
  const signedIn = useAccountStore(state => !!state.identity);
  const name = profile?.username || (signedIn ? "Player" : "Guest");
  return <header className="toolbar">
    <Link className="toolbar-button" to="/settings" aria-label="Settings" title="Settings"><Icon name="settings" /></Link>
    <Link className="toolbar-brand" to="/" aria-label="notsu home"><NotsuMark /><span>notsu</span></Link>
    <nav className="toolbar-navigation" aria-label="Main navigation">
      <NavLink className="toolbar-tab" to="/rhythm" aria-label="Play"><Icon name="play" /><span>Play</span></NavLink>
      <NavLink className="toolbar-tab" to="/browse" aria-label="Browse"><Icon name="browse" /><span>Browse</span></NavLink>
      <NavLink className="toolbar-tab" to="/editor" aria-label="Create"><Icon name="editor" /><span>Create</span></NavLink>
    </nav>
    <div className="toolbar-end" role="group" aria-label="Player and social">
      <MusicDropdown />
      {onlineAvailable && <>
      <NavLink className="toolbar-button" to="/messages" aria-label="Chat" title="Messages"><Icon name="chat" /></NavLink>
      <NavLink className="toolbar-button" to="/friends" aria-label="Friends" title="Friends"><Icon name="friends" /></NavLink>
      <NavLink className="toolbar-profile" to="/account" title="Your account" aria-label="Your account">
        {profile ? <Avatar name={profile.displayName || profile.username} size="sm" /> : <Icon name="profile" />}
        <span><strong>{name}</strong><span>{signedIn ? "Signed in" : "Sign in"}</span></span>
      </NavLink>
      </>}
    </div>
  </header>;
}
