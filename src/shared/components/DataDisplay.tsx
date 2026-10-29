import type { CSSProperties, ReactNode } from "react";
import { cx } from "./classes";

/** Initial-based player avatar. The tint is derived from the name so it stays stable. */
export function Avatar({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  const initial = [...name.trim()][0]?.toUpperCase() ?? "?";
  const hue = 180 + [...name].reduce((sum, char) => sum + (char.codePointAt(0) ?? 0), 0) % 110;
  return <span className={cx("ui-avatar", size !== "md" && `ui-avatar--${size}`, className)} style={{ "--ui-avatar-hue": hue } as CSSProperties} aria-hidden="true">{initial}</span>;
}

/** Labelled numbers, such as song length or score. */
export function StatList({ items, className }: { items: readonly { label: ReactNode; value: ReactNode }[]; className?: string }) {
  return <dl className={cx("ui-stats", className)}>
    {items.map((item, index) => <div key={index}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
  </dl>;
}

export function List({ label, className, children }: { label?: string; className?: string; children: ReactNode }) {
  return <ul className={cx("ui-list", className)} aria-label={label}>{children}</ul>;
}

/** A row in a <List>: leading media, a title block and trailing actions. */
export function ListItem({ leading, title, subtitle, meta, actions, className, children }: {
  leading?: ReactNode; title: ReactNode; subtitle?: ReactNode; meta?: ReactNode; actions?: ReactNode; className?: string; children?: ReactNode;
}) {
  return <li className={cx("ui-list-item", className)}>
    <div className="ui-list-item__main">
      {leading}
      <div className="ui-list-item__text">
        <span className="ui-list-item__title">{title}</span>
        {subtitle && <span className="ui-list-item__subtitle">{subtitle}</span>}
        {meta && <span className="ui-list-item__meta">{meta}</span>}
      </div>
    </div>
    {children}
    {actions && <div className="ui-list-item__actions">{actions}</div>}
  </li>;
}
