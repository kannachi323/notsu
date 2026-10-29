import { useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { CoverArt, Icon, MAIN_CONTENT_ID, NotsuMark } from "../../../shared/components";
import { AppScreen } from "./AppScreen";
import { starterMaps } from "../../maps/data/starters";
import { onlineAvailable } from "../../accounts/data/availability";

// Offline builds browse the local collection instead of an unavailable catalog.
const discoverRoute = onlineAvailable ? "/browse?source=online" : "/browse";

const destinations = [
  { to: "/rhythm", tone: "play", icon: "play", title: "Play", caption: "Your library, your rhythm", key: "P" },
  { to: discoverRoute, tone: "browse", icon: "browse", title: "Discover", caption: "Find your next song", key: "B" },
  { to: "/editor", tone: "create", icon: "editor", title: "Create", caption: "Make something move", key: "E" },
  { to: "/settings", tone: "settings", icon: "settings", title: "Settings", caption: "Make it feel like you", key: "O" },
] as const;

export function HomeScreen() {
  const navigate = useNavigate();
  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.repeat ||
        (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, button, a, [contenteditable]"))) return;
      const destination = ({ Enter: "/rhythm", p: "/rhythm", b: discoverRoute, e: "/editor", o: "/settings" } as Record<string, string>)[event.key];
      if (destination) { event.preventDefault(); navigate(destination); }
    };
    window.addEventListener("keydown", shortcuts);
    return () => window.removeEventListener("keydown", shortcuts);
  }, [navigate]);
  return <AppScreen className="main-menu-screen">
    <main className="main-menu" id={MAIN_CONTENT_ID} tabIndex={-1}>
      <h1 className="visually-hidden">notsu</h1>
      <div className="main-menu-band" aria-hidden="true" />
      <Link className="main-menu-logo" to="/rhythm" aria-label="Play notsu">
        <span className="main-menu-logo-art" aria-hidden="true"><NotsuMark /></span>
        <span className="main-menu-logo-word" aria-hidden="true">notsu</span>
        <span className="main-menu-logo-caption">Press Enter to play</span>
      </Link>
      <nav className="main-menu-buttons" aria-label="Choose an activity">
        {destinations.map(item => <Link key={item.key} className={`main-menu-button main-menu-${item.tone}`} to={item.to}>
          <Icon name={item.icon} /><span><strong>{item.title}</strong><small>{item.caption}</small></span><kbd>{item.key}</kbd>
        </Link>)}
      </nav>
    </main>
    <aside className="main-menu-bottom" aria-label="Getting started">
      <div className="main-menu-tip"><span aria-hidden="true">◈</span><p>One shared circle. One press.<br /><small>Any gameplay key works, even when the lines cross.</small></p><Link className="ui-link" to="/how-to-play">How to play →</Link></div>
      <Link className="main-menu-featured" to={`/rhythm?map=${starterMaps[0].revision}`}>
        <span className="main-menu-featured-art" aria-hidden="true"><CoverArt seed={starterMaps[0].setId} /></span>
        <span><small>Start with an included song</small><strong>{starterMaps[0].title}</strong><small>Original music · two difficulties</small></span>
        <Icon name="forward" />
      </Link>
    </aside>
  </AppScreen>;
}
