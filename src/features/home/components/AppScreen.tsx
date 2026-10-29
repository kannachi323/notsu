import type { ReactNode } from "react";
import { MAIN_CONTENT_ID, cx } from "../../../shared/components";
import { HomeHeader } from "./HomeHeader";

/**
 * The frame shared by every non-gameplay screen: skip link, top toolbar, the
 * screen's content and the attribution footer. Put a <Page> inside it for
 * standard content screens.
 */
export function AppScreen({ className, footer = true, children }: { className?: string; footer?: boolean; children: ReactNode }) {
  return <div className={cx("app-screen", className)}>
    {/* Hash routing would treat #main-content as a route, so focus the target directly. */}
    <a className="ui-skip-link" href={`#${MAIN_CONTENT_ID}`} onClick={event => { event.preventDefault(); document.getElementById(MAIN_CONTENT_ID)?.focus(); }}>Skip to main content</a>
    <HomeHeader />
    {children}
    {footer && <SiteFooter />}
  </div>;
}

export function SiteFooter() {
  return <footer className="site-footer"><span>Unofficial community project · Not affiliated with ppy</span><span>notsu · 0.1.0</span></footer>;
}
