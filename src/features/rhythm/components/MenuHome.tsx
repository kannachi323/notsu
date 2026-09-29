export type MenuPage = "home" | "play" | "settings" | "help";

export function MenuHome({ navigate }: { navigate: (page: MenuPage) => void }) {
  return <section className="home-screen" aria-labelledby="home-title">
    <div className="home-identity">
      <svg className="home-mark" viewBox="0 0 460 180" aria-hidden="true">
        <defs><radialGradient id="menu-orb" cx="32%" cy="28%" r="75%">
          <stop offset="0" stopColor="var(--text)" />
          <stop offset=".4" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--surface)" />
        </radialGradient></defs>
        <path d="M 24 148 L 436 48" stroke="var(--border)" strokeWidth="2" />
        <circle cx="106.4" cy="128" r="32" fill="var(--background)" stroke="var(--text)" strokeWidth="2" />
        <circle cx="106.4" cy="128" r="20" fill="url(#menu-orb)" stroke="var(--accent)" strokeWidth="2" />
        <circle cx="222" cy="100" r="13" fill="url(#menu-orb)" stroke="var(--accent)" strokeWidth="1.5" />
        <path d="M 304.4 80 L 386.8 60" stroke="var(--hold)" strokeWidth="6" />
        <circle cx="304.4" cy="80" r="13" fill="var(--hold)" />
        <circle cx="386.8" cy="60" r="13" fill="var(--background)" stroke="var(--hold)" strokeWidth="2" />
      </svg>
      <h1 id="home-title">notsu</h1>
    </div>
    <nav className="home-navigation" aria-label="Main menu">
      <button className="home-play" data-menu="play" onClick={() => navigate("play")}>
        Play <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7Z" fill="currentColor" /></svg>
      </button>
      <button className="home-link" data-menu="settings" onClick={() => navigate("settings")}>Settings <span aria-hidden="true">›</span></button>
      <button className="home-link" data-menu="help" onClick={() => navigate("help")}>How to play <span aria-hidden="true">›</span></button>
    </nav>
  </section>;
}
