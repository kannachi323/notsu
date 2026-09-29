import { useRef } from "react";
import { Link } from "react-router";
import { CardArtwork } from "./CardArtwork";
import { HomeHeader } from "./HomeHeader";
import { HomeUpdates } from "./HomeUpdates";

export function HomeScreen() {
  const main = useRef<HTMLElement>(null);

  return <div className="notsu-home">
    <a className="notsu-skip-link" href="#home-content" onClick={(event) => {
      // Keep fragment navigation from changing the desktop router's location.
      event.preventDefault();
      main.current?.focus();
    }}>Skip to main content</a>
    <HomeHeader />
    <main className="notsu-main" id="home-content" tabIndex={-1} ref={main}>
      <h1 className="visually-hidden">notsu home</h1>
      <nav className="notsu-destinations" aria-label="Choose an activity">
        <Link className="notsu-destination notsu-destination-browse" to="/browse">
          <CardArtwork kind="browse" /><span>Browse</span>
        </Link>
        <Link className="notsu-destination notsu-destination-play" to="/rhythm">
          <CardArtwork kind="play" /><span>Play</span>
        </Link>
        <Link className="notsu-destination notsu-destination-editor" to="/editor">
          <CardArtwork kind="editor" /><span>Editor</span>
        </Link>
      </nav>
      <HomeUpdates />
    </main>
    <footer className="notsu-footer"><span>Unofficial community project · Not affiliated with ppy</span><span>notsu <span className="notsu-version">0.1.0</span></span></footer>
  </div>;
}
