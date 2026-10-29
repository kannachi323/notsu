import type { ComponentProps, ReactNode } from "react";
import { Link } from "react-router";
import { cx } from "./classes";
import { Icon } from "./Icon";

/** The bottom action bar for game screens such as song selection. Back sits at the left edge. */
export function ScreenFooter({ back, className, children }: { back: { to: string; label?: string }; className?: string; children?: ReactNode }) {
  return <footer className={cx("ui-screen-footer", className)}>
    <Link className="ui-footer-back" to={back.to}><Icon name="back" /><span>{back.label ?? "Back"}</span><kbd>Esc</kbd></Link>
    {children}
  </footer>;
}

/** A slanted footer action with an icon, a label and an optional keyboard shortcut. */
export function FooterButton({ icon, label, shortcut, tone = "accent", className, children, type = "button", ...props }: {
  icon: ReactNode; label: ReactNode; shortcut?: string; tone?: "accent" | "violet" | "pink" | "neutral";
} & ComponentProps<"button">) {
  return <button type={type} className={cx("ui-footer-button", tone !== "accent" && `ui-footer-button--${tone}`, className)} {...props}>
    <span className="ui-footer-button__content">{icon}<span className="ui-footer-button__label">{label}</span>{shortcut && <kbd>{shortcut}</kbd>}</span>
    {children}
  </button>;
}
