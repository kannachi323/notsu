import { cloneElement, useId } from "react";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { cx } from "./classes";

type Control = ReactElement<{ "aria-describedby"?: string; "aria-invalid"?: boolean }>;

/**
 * A labelled input, textarea or select. Pass the control as the only child; the
 * hint and error are linked to it with aria-describedby.
 */
export function Field({ label, hint, error, className, children }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; className?: string; children: Control }) {
  const id = useId(), hintId = hint ? `${id}-hint` : undefined, errorId = error ? `${id}-error` : undefined;
  const describedBy = [children.props["aria-describedby"], hintId, errorId].filter(Boolean).join(" ") || undefined;
  const control = cloneElement(children, { "aria-describedby": describedBy, ...(error ? { "aria-invalid": true } : {}) });
  return <div className={cx("ui-field", !!error && "ui-field--invalid", className)}>
    <label className="ui-field__box"><span className="ui-field__label">{label}</span>{control}</label>
    {hint && <p className="ui-field__hint" id={hintId}>{hint}</p>}
    {error && <p className="ui-field__error" id={errorId} role="alert">{error}</p>}
  </div>;
}

/** A checkbox, or an on/off switch with `toggle`. */
export function Checkbox({ label, description, toggle, className, ...input }: { label: ReactNode; description?: ReactNode; toggle?: boolean } & Omit<ComponentProps<"input">, "type">) {
  const id = useId(), descriptionId = description ? `${id}-description` : undefined;
  return <div className={cx("ui-check", toggle && "ui-check--switch", className)}>
    <label className="ui-check__row">
      <input type="checkbox" role={toggle ? "switch" : undefined} aria-describedby={descriptionId} {...input} />
      <span className="ui-check__label">{label}</span>
    </label>
    {description && <p className="ui-check__description" id={descriptionId}>{description}</p>}
  </div>;
}

/** A range input with its label and current value. */
export function Slider({ label, valueText, description, id, ...input }: { label: ReactNode; valueText: ReactNode; description?: ReactNode } & Omit<ComponentProps<"input">, "type">) {
  const generated = useId(), inputId = id ?? generated, descriptionId = description ? `${inputId}-help` : undefined;
  return <div className="ui-slider">
    <div className="ui-slider__header"><label htmlFor={inputId}>{label}</label><output htmlFor={inputId}>{valueText}</output></div>
    <input type="range" id={inputId} aria-describedby={descriptionId} {...input} />
    {description && <p className="ui-slider__description" id={descriptionId}>{description}</p>}
  </div>;
}
