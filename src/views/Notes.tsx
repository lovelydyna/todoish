import { NotesPanel } from "../components/NotesPanel";
import { SettingsTab } from "./Setup";

interface NotesProps {
  onTasks: () => void;
  onSettings: (tab?: SettingsTab) => void;
}

export function Notes({ onTasks, onSettings }: NotesProps) {
  return <NotesPanel onHome={onTasks} onSettings={() => onSettings()} />;
}
