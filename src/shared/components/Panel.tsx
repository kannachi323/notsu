import { useId } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./classes";

type PanelProps = {
  as?: "section" | "article" | "aside" | "div";
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  headingLevel?: 2 | 3;
  variant?: "default" | "raised" | "outline" | "accent";
} & Omit<HTMLAttributes<HTMLElement>, "title">;

/** A surface for a group of related content. Children are spaced on the shared vertical rhythm. */
export function Panel({ as: Tag = "section", title, description, actions, headingLevel = 2, variant = "default", className, children, ...props }: PanelProps) {
  const id = useId(), Heading = headingLevel === 2 ? "h2" : "h3";
  const labelled = title && !props["aria-label"] && !props["aria-labelledby"] ? id : undefined;
  return <Tag className={cx("ui-panel", variant !== "default" && `ui-panel--${variant}`, className)} aria-labelledby={labelled} {...props}>
    {(title || actions) && <header className="ui-panel__header">
      <div>{title && <Heading id={id} className="ui-panel__title">{title}</Heading>}{description && <p className="ui-panel__description">{description}</p>}</div>
      {actions && <div className="ui-panel__actions">{actions}</div>}
    </header>}
    {children}
  </Tag>;
}

/** A heading row with optional trailing actions, for sections that sit directly on the page. */
export function SectionHeader({ title, description, actions, level = 2, id }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; level?: 2 | 3; id?: string }) {
  const Heading = level === 2 ? "h2" : "h3";
  return <div className="ui-section-header">
    <div><Heading id={id}>{title}</Heading>{description && <p>{description}</p>}</div>
    {actions && <div className="ui-cluster">{actions}</div>}
  </div>;
}

/** Vertical rhythm container. */
export function Stack({ gap = "md", className, children }: { gap?: "sm" | "md" | "lg"; className?: string; children: ReactNode }) {
  return <div className={cx("ui-stack", gap !== "md" && `ui-stack--${gap}`, className)}>{children}</div>;
}

/** Horizontal, wrapping row of controls. */
export function Cluster({ justify = "start", className, children }: { justify?: "start" | "end" | "between"; className?: string; children: ReactNode }) {
  return <div className={cx("ui-cluster", justify !== "start" && `ui-cluster--${justify}`, className)}>{children}</div>;
}
