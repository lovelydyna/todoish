import { Item } from "../types";
import {
  countByDay,
  dayKey,
  isSameDay,
  isSameMonth,
  monthGrid,
  monthHeading,
  WEEKDAY_INITIALS,
} from "../lib/calendarGrid";
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "./Icons";

interface MonthGridProps {
  items: Item[];
  /** First of the month currently shown. */
  month: Date;
  selectedDay: Date | null;
  onSelectDay: (date: Date | null) => void;
  onChangeMonth: (delta: number) => void;
  /** Switches back to the week strip — the month title doubles as that control. */
  onToggleMonth: () => void;
  today?: Date;
}

/**
 * Itsycal-style month: a weekday header over six fixed rows, today in the
 * accent, days carrying items marked with a dot. Clicking a day filters the list.
 */
export function MonthGrid({
  items,
  month,
  selectedDay,
  onSelectDay,
  onChangeMonth,
  onToggleMonth,
  today = new Date(),
}: MonthGridProps) {
  const weeks = monthGrid(month);
  const counts = countByDay(items);
  const isCurrentMonth = isSameMonth(month, today);
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthsAway =
    (thisMonth.getFullYear() - month.getFullYear()) * 12 + thisMonth.getMonth() - month.getMonth();

  return (
    <div className="month-grid">
      <div className="cal-header">
        <button type="button" className="cal-title cal-title--open" title="back to week [m]"
          onClick={onToggleMonth}>
          {monthHeading(month)}
          <ChevronDownIcon />
        </button>
        <div className="cal-nav">
          <button type="button" className="cal-nav-btn" aria-label="previous month" title="previous month [←]"
            onClick={() => onChangeMonth(-1)}><ChevronLeftIcon /></button>
          <button type="button" className="cal-today" disabled={isCurrentMonth}
            title="back to this month" onClick={() => onChangeMonth(monthsAway)}>Today</button>
          <button type="button" className="cal-nav-btn" aria-label="next month" title="next month [→]"
            onClick={() => onChangeMonth(1)}><ChevronRightIcon /></button>
        </div>
      </div>

      <div className="month-weekdays">
        {WEEKDAY_INITIALS.map((initial, i) => (
          <span key={i} className="month-weekday">{initial}</span>
        ))}
      </div>

      {weeks.map((week, w) => (
        <div key={w} className="month-week">
          {week.map((date) => {
            const count = counts[dayKey(date)] ?? 0;
            const outside = !isSameMonth(date, month);
            const isToday = isSameDay(date, today);
            const isSelected = !!selectedDay && isSameDay(date, selectedDay);
            return (
              <button
                key={dayKey(date)}
                type="button"
                className={
                  "month-day" +
                  (outside ? " month-day--outside" : "") +
                  (isToday ? " month-day--today" : "") +
                  (isSelected ? " month-day--selected" : "")
                }
                title={`${date.toDateString()}${count ? ` · ${count} item${count === 1 ? "" : "s"}` : ""}`}
                aria-pressed={isSelected}
                onClick={() => onSelectDay(isSelected ? null : date)}
              >
                <span className="month-day-number">{date.getDate()}</span>
                <span className={`day-dot${count > 0 ? " day-dot--on" : ""}`} />
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
