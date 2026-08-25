import { ReactNode } from "react";

interface IconTagProps {
  /** Short name shown in the hover tag, e.g. "settings". */
  label: string;
  /** The key that triggers it, if any — shown as a small key cap. */
  keyHint?: string;
  children: ReactNode;
}

/**
 * Wraps an icon-only button with a small hover tag naming it and its
 * keybinding — a custom bubble rather than the OS tooltip, so it shows up
 * fast and reads consistently across platforms.
 */
export function IconTag({ label, keyHint, children }: IconTagProps) {
  return (
    <span className="icon-tag">
      {children}
      <span className="icon-tag-bubble" role="tooltip">
        {label}
        {keyHint && <span className="icon-tag-key">{keyHint}</span>}
      </span>
    </span>
  );
}
