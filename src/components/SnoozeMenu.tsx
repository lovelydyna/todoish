interface SnoozeMenuProps {
  onSnooze: (isoDate: string) => void;
  onClose: () => void;
}

function snoozeDate(option: number): string {
  const now = new Date();
  switch (option) {
    case 1: // 15 min
      return new Date(now.getTime() + 15 * 60 * 1000).toISOString();
    case 2: // 1 hour
      return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    case 3: // 4 hours
      return new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString();
    case 4: {
      // Tomorrow 9am
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      return tomorrow.toISOString();
    }
    default:
      return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  }
}

export function SnoozeMenu({ onSnooze, onClose }: SnoozeMenuProps) {
  const options = [
    { key: "1", label: "15 minutes" },
    { key: "2", label: "1 hour" },
    { key: "3", label: "4 hours" },
    { key: "4", label: "tomorrow 9am" },
  ];

  return (
    <div className="snooze-menu">
      <div className="snooze-header">snooze until</div>
      {options.map((opt, i) => (
        <button
          key={opt.key}
          className="snooze-option"
          onClick={() => onSnooze(snoozeDate(i + 1))}
        >
          <span className="snooze-key">[{opt.key}]</span>
          {opt.label}
        </button>
      ))}
      <button className="snooze-cancel" onClick={onClose}>
        <span className="snooze-key">[esc]</span> cancel
      </button>
    </div>
  );
}
