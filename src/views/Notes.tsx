import { NotesPanel } from "../components/NotesPanel";
import { SettingsTab } from "./Setup";

interface NotesProps {
  /** Start on a fresh note rather than reopening the last one — set when
   *  arriving via the quick "new note" shortcut rather than plain navigation. */
  startNew?: boolean;
  onTasks: () => void;
  onSettings: (tab?: SettingsTab) => void;
}

export function Notes({ startNew, onTasks, onSettings }: NotesProps) {
  return <NotesPanel startNew={startNew} onHome={onTasks} onSettings={() => onSettings()} />;
}
