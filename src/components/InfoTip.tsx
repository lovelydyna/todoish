import { useState, useId } from "react";

interface InfoTipProps {
  children: React.ReactNode;
}

/**
 * The `i` badge beside a setting's title. Instructions live in here rather
 * than as standing body text, so the settings list stays scannable and the
 * detail is one hover away when you actually need it.
 *
 * Focusable and described via aria, so the text is reachable without a mouse.
 */
export function InfoTip({ children }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span className="infotip">
      <button
        type="button"
        className="infotip-badge"
        aria-label="more information"
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        // Tapping toggles, so this works without hover too.
        onClick={(e) => { e.preventDefault(); setOpen((v) => !v); }}
      >
        i
      </button>
      {open && (
        <span className="infotip-bubble" id={id} role="tooltip">
          {children}
        </span>
      )}
    </span>
  );
}

/** A setting's title line: label, optional info badge, optional trailing value. */
export function FieldLabel({
  children,
  info,
  value,
}: {
  children: React.ReactNode;
  info?: React.ReactNode;
  value?: React.ReactNode;
}) {
  return (
    <label className="field-label">
      <span className="field-label-text">{children}</span>
      {info && <InfoTip>{info}</InfoTip>}
      {value !== undefined && <span className="field-value">{value}</span>}
    </label>
  );
}
