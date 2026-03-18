export function timeHint(due: string | null, energy: string | null): string {
  if (energy === "Quick") return "quick";
  if (!due) return "";

  const dueDate = new Date(due);
  const now = new Date();
  const diffMs = dueDate.getTime() - now.getTime();
  const diffH = diffMs / (1000 * 60 * 60);

  if (diffMs < 0) {
    const overH = Math.abs(diffH);
    if (overH < 1) return "overdue";
    return `${Math.round(overH)}h overdue`;
  }

  if (diffH < 1) {
    const diffM = Math.round(diffMs / (1000 * 60));
    return `${diffM}m`;
  }

  if (diffH < 8) {
    return `${Math.round(diffH)}h`;
  }

  return dueDate.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}
