import { useRef } from "react";
import { Link } from "react-router";
import { HomeHeader } from "./HomeHeader";
import { NotsuMark, Icon } from "./Icon";
import { starterMaps } from "../../maps/data/starters";

export function HomeScreen() {
  const main = useRef<HTMLElement>(null);

  return <div className="notsu-home rhythm-home">
    <a className="notsu-skip-link" href="#home-content" onClick={(event) => {
      // Keep fragment navigation from changing the desktop router's location.
      event.preventDefault();
      main.current?.focus();
    }}>Skip to main content</a>
    <HomeHeader />
    <main className="rhythm-home-main" id="home-content" tabIndex={-1} ref={main}>
      <div className="home-identity"><span className="home-orbit" aria-hidden="true"><NotsuMark /></span><h1>notsu</h1><p>Every beat. A new direction.</p></div>
      <nav className="home-menu" aria-label="Choose an activity">
        <Link className="home-play" to="/rhythm"><Icon name="play" /><span><strong>Play</strong><small>Find your rhythm</small></span><span aria-hidden="true">↗</span></Link>
        <Link to="/browse"><Icon name="browse" /><span><strong>Browse maps</strong><small>Songs, difficulties & collections</small></span></Link>
        <Link to="/editor"><Icon name="editor" /><span><strong>Create</strong><small>Make the lines move to your music</small></span></Link>
        <div className="home-menu-bottom"><Link to="/settings">Settings</Link><Link to="/how-to-play">How to play</Link></div>
      </nav>
    </main>
    <div className="home-featured"><span className="home-featured-art" aria-hidden="true"/><div><span>Included with notsu</span><strong>Orbit Signal</strong><p>Original music · two difficulties · ready to play</p></div><Link to={`/rhythm?map=${starterMaps[0].revision}`}>Try it →</Link></div>
    <footer className="notsu-footer"><span>Unofficial community project · Not affiliated with ppy</span><span>notsu · 0.1.0</span></footer>
  </div>;
}
