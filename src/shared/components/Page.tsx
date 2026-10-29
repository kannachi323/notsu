import type { ReactNode } from "react";
import { Link } from "react-router";
import { cx } from "./classes";
import { Icon, type IconName } from "./Icon";

export const MAIN_CONTENT_ID = "main-content";

/** The main content column. Every non-game screen uses it so page gutters and widths stay identical. */
export function Page({ width = "default", className, children }: { width?: "narrow" | "default" | "wide"; className?: string; children: ReactNode }) {
  return <main id={MAIN_CONTENT_ID} tabIndex={-1} className={cx("ui-page", width !== "default" && `ui-page--${width}`, className)}>{children}</main>;
}

/** Title block for a page. Pass <TabLinks> or <Tabs> as children to seat them on the header's bottom edge. */
export function PageHeader({ title, description, eyebrow, icon, back, actions, children }: {
  title: ReactNode; description?: ReactNode; eyebrow?: ReactNode; icon?: IconName;
  back?: { to: string; label: string }; actions?: ReactNode; children?: ReactNode;
}) {
  return <header className={cx("ui-page-header", !!children && "ui-page-header--tabs")}>
    {back && <BackLink to={back.to}>{back.label}</BackLink>}
    <div className="ui-page-header__row">
      {icon && <span className="ui-page-header__icon" aria-hidden="true"><Icon name={icon} /></span>}
      <div className="ui-page-header__text">
        {eyebrow && <p className="ui-page-header__eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="ui-page-header__description">{description}</p>}
      </div>
      {actions && <div className="ui-page-header__actions">{actions}</div>}
    </div>
    {children}
  </header>;
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link className="ui-back-link" to={to}><Icon name="back" />{children}</Link>;
}
