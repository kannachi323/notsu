import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { cx } from "./classes";
import { IconButton } from "./Button";
import { Icon } from "./Icon";

/**
 * A modal built on the native <dialog>, which provides focus containment and
 * Escape handling. Clicking the backdrop also closes it.
 */
export function Dialog({ open, onClose, title, eyebrow, footer, className, children }: {
  open: boolean; onClose: () => void; title: ReactNode; eyebrow?: ReactNode; footer?: ReactNode; className?: string; children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null), titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    else if (!open && element.open) element.close();
  }, [open]);
  useEffect(() => {
    const element = dialog.current;
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} className={cx("ui-dialog", className)} aria-labelledby={titleId} onClose={onClose}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="ui-dialog__body">
      <header className="ui-dialog__header">
        <div>{eyebrow && <p className="ui-dialog__eyebrow">{eyebrow}</p>}<h2 id={titleId} className="ui-dialog__title">{title}</h2></div>
        <IconButton label="Close" icon={<Icon name="close" />} onClick={onClose} />
      </header>
      {children}
      {footer && <footer className="ui-dialog__footer">{footer}</footer>}
    </div>
  </dialog>;
}
