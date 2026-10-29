import type { ComponentProps, ReactNode } from "react";
import { Link, type LinkProps } from "react-router";
import { cx } from "./classes";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonLook {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretch to the container width. */
  block?: boolean;
  /** Slanted game-screen style. */
  sheared?: boolean;
  /** Leading icon, usually an <Icon />. */
  icon?: ReactNode;
}

export function buttonClass({ variant = "secondary", size = "md", block, sheared }: ButtonLook, className?: string) {
  return cx("ui-button", `ui-button--${variant}`, size !== "md" && `ui-button--${size}`, block && "ui-button--block", sheared && "ui-button--sheared", className);
}

/** Defaults to type="button"; pass type="submit" inside forms. */
export function Button({ variant, size, block, sheared, icon, className, children, type = "button", ...props }: ButtonLook & ComponentProps<"button">) {
  return <button type={type} className={buttonClass({ variant, size, block, sheared }, className)} {...props}>
    <span className="ui-button__content">{icon}{children}</span>
  </button>;
}

/** A router link that looks like a button. */
export function ButtonLink({ variant, size, block, sheared, icon, className, children, ...props }: ButtonLook & LinkProps) {
  return <Link className={buttonClass({ variant, size, block, sheared }, className)} {...props}>
    <span className="ui-button__content">{icon}{children}</span>
  </Link>;
}

/** A square icon-only button. The label is required and used for the accessible name and tooltip. */
export function IconButton({ label, icon, variant = "ghost", size, className, title, ...props }:
  { label: string; icon: ReactNode; variant?: ButtonVariant; size?: ButtonSize } & Omit<ComponentProps<"button">, "children" | "aria-label">) {
  return <button type="button" aria-label={label} title={title ?? label} className={buttonClass({ variant, size }, cx("ui-button--icon", className))} {...props}>
    {icon}
  </button>;
}
