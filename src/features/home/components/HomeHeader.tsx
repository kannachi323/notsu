import { Link } from "react-router";
import { NotsuMark, Icon } from "./Icon";
import { MusicDropdown } from "./MusicDropdown";
import { useAccountStore } from "../../accounts/accountStore";

export function HomeHeader() {
  const profile = useAccountStore(state => state.profile);
  const signedIn = useAccountStore(state => !!state.identity);
  return <header className="notsu-header">
    <Link className="notsu-brand" to="/" aria-label="notsu home"><NotsuMark /><span>notsu</span></Link>
    <nav className="notsu-navigation" aria-label="Main navigation">
      <Link className="notsu-icon-button" to="/rhythm" aria-label="Play" title="Play"><Icon name="play" /></Link>
      <Link className="notsu-icon-button" to="/browse" aria-label="Browse" title="Browse"><Icon name="browse" /></Link>
      <Link className="notsu-icon-button" to="/editor" aria-label="Editor" title="Editor"><Icon name="editor" /></Link>
      <MusicDropdown />
    </nav>
    <div className="notsu-social" role="group" aria-label="Player and social">
      <Link className="notsu-profile" to="/account" title="Your account" aria-label="Your account"><Icon name="profile" /><span><strong>{profile?.username || (signedIn ? "Player" : "Guest")}</strong><span>{signedIn ? "Signed in" : "Sign in"}</span></span></Link>
      <Link className="notsu-icon-button" to="/messages" aria-label="Chat" title="Messages"><Icon name="chat" /></Link>
      <Link className="notsu-icon-button" to="/friends" aria-label="Friends" title="Friends"><Icon name="friends" /></Link>
    </div>
  </header>;
}
