import type { ComponentProps, ReactNode } from "react";
import { cx } from "./classes";
import { Icon } from "./Icon";

export type Tone = "info" | "success" | "warning" | "danger";

/** An inline message. Use role="alert" for errors that appear after an action and role="status" for progress. */
export function Notice({ tone = "info", title, actions, role, className, children }: {
  tone?: Tone; title?: ReactNode; actions?: ReactNode; role?: "alert" | "status"; className?: string; children?: ReactNode;
}) {
  return <div className={cx("ui-notice", `ui-notice--${tone}`, className)} role={role}>
    <Icon name={tone === "danger" || tone === "warning" ? "alert" : tone === "success" ? "check" : "info"} className="ui-notice__icon" />
    <div className="ui-notice__body">
      {title && <p className="ui-notice__title">{title}</p>}
      {children && <div>{children}</div>}
      {actions && <div className="ui-notice__actions">{actions}</div>}
    </div>
  </div>;
}

export function Badge({ tone = "neutral", className, ...props }: { tone?: "neutral" | "accent" | "violet" | "success" | "warning" | "danger" } & ComponentProps<"span">) {
  return <span className={cx("ui-badge", tone !== "neutral" && `ui-badge--${tone}`, className)} {...props} />;
}

export function Loading({ children }: { children: ReactNode }) {
  return <p className="ui-loading" role="status"><span className="ui-spinner" aria-hidden="true" />{children}</p>;
}

/** Shown when a list or view has nothing to display. */
export function EmptyState({ title, description, action, art = <OrbitArt />, headingLevel = 2 }: {
  title: ReactNode; description?: ReactNode; action?: ReactNode; art?: ReactNode; headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return <div className="ui-empty">
    <span className="ui-empty__art" aria-hidden="true">{art}</span>
    <Heading className="ui-empty__title">{title}</Heading>
    {description && <p className="ui-empty__description">{description}</p>}
    {action && <div className="ui-empty__action">{action}</div>}
  </div>;
}

/** The notsu line-and-orb motif used for empty and welcome states. */
export function OrbitArt() {
  return <svg viewBox="0 0 88 56" fill="none" focusable="false">
    <path d="M4 50 84 6" stroke="var(--ui-line-strong)" strokeWidth="1.5" />
    <circle cx="44" cy="28" r="17" stroke="currentColor" strokeWidth="1.5" opacity=".7" />
    <circle cx="44" cy="28" r="7" fill="currentColor" />
    <circle cx="18" cy="42.3" r="4" fill="var(--ui-violet)" />
    <circle cx="70" cy="13.7" r="3" fill="currentColor" opacity=".6" />
  </svg>;
}
