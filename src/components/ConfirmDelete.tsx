interface ConfirmDeleteProps {
  /** "task" or "event" — named in the title so it says what goes. */
  noun: string;
  name: string;
  /** Extra line under the name, e.g. how to undo. */
  note?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** The delete dialog shared by both lists. Enter/Escape are handled by the
 *  view's own key handler, so the buttons only show the keys. */
export function ConfirmDelete({ noun, name, note, onConfirm, onCancel }: ConfirmDeleteProps) {
  return (
    <div className="overlay" onClick={onCancel}>
      <div
        className="confirm-delete"
        role="alertdialog"
        aria-labelledby="confirm-delete-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-title" id="confirm-delete-title">Delete {noun}?</div>
        <div className="confirm-task">{name}</div>
        {note && <div className="confirm-note">{note}</div>}
        <div className="dialog-actions">
          <button type="button" className="btn btn--secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn--danger" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}
