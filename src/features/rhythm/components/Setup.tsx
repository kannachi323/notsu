import { useEffect, useRef, useState } from "react";
import type { Settings } from "../data/settings";
import type { ChartMode } from "../data/charts";
import { MenuHome } from "./MenuHome";
import type { MenuPage } from "./MenuHome";
import { ChartSelect } from "./ChartSelect";
import { SettingsPanel } from "./SettingsPanel";
import { HowToPlay } from "./HowToPlay";

interface Props {
  settings: Settings;
  updateSettings: (settings: Settings) => void;
  fileName: string;
  loading: boolean;
  error: string;
  chooseFile: (file: File | undefined) => void;
  start: (mode?: ChartMode) => void;
}

const titles = { play: "Play", settings: "Settings", help: "How to play" };

export function Setup(props: Props) {
  const [page, setPage] = useState<MenuPage>(props.error ? "play" : "home");
  const previousPage = useRef<MenuPage | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (page === "home" && previousPage.current && previousPage.current !== "home") {
      root.current?.querySelector<HTMLButtonElement>(`[data-menu="${previousPage.current}"]`)?.focus();
    } else if (page !== "home") heading.current?.focus();
    previousPage.current = page;
  }, [page]);
  useEffect(() => {
    const back = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) setPage("home");
    };
    window.addEventListener("keydown", back);
    return () => window.removeEventListener("keydown", back);
  }, []);

  return <div className="menu-root" ref={root}>
    {page === "home" ? <MenuHome navigate={setPage} /> : <section className="menu-page" aria-labelledby="menu-title">
      <header className="menu-page-header">
        <button className="back-button" onClick={() => setPage("home")}><span aria-hidden="true">←</span> Home</button>
        <h1 id="menu-title" ref={heading} tabIndex={-1}>{titles[page]}</h1>
      </header>
      {page === "play" && <ChartSelect fileName={props.fileName} loading={props.loading} error={props.error} chooseFile={props.chooseFile} start={props.start} />}
      {page === "settings" && <SettingsPanel settings={props.settings} updateSettings={props.updateSettings} />}
      {page === "help" && <HowToPlay />}
    </section>}
  </div>;
}
