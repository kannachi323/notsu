import type { ReactNode } from "react";
import { Link } from "react-router";
import { cx } from "./classes";

export interface TabItem<T extends string> { value: T; label: ReactNode; count?: number }

/** Toggle buttons that switch a view in place. Use "segmented" for compact option pickers. */
export function Tabs<T extends string>({ items, value, onChange, label, variant = "underline", disabled, className }: {
  items: readonly TabItem<T>[]; value: T | null; onChange: (value: T) => void; label: string;
  variant?: "underline" | "segmented"; disabled?: boolean; className?: string;
}) {
  return <div className={cx("ui-tabs", variant === "segmented" && "ui-tabs--segmented", className)} role="group" aria-label={label}>
    {items.map(item => <button key={item.value} type="button" className="ui-tab" aria-pressed={item.value === value} disabled={disabled} onClick={() => onChange(item.value)}>
      {item.label}{item.count !== undefined && <span className="ui-tab__count">{item.count}</span>}
    </button>)}
  </div>;
}

/** Tabs that navigate between routes. */
export function TabLinks({ items, label, className }: { items: readonly { to: string; label: ReactNode; current: boolean }[]; label: string; className?: string }) {
  return <nav className={cx("ui-tabs", className)} aria-label={label}>
    {items.map(item => <Link key={item.to} className="ui-tab" to={item.to} aria-current={item.current ? "page" : undefined}>{item.label}</Link>)}
  </nav>;
}
