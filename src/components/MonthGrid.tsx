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

interface MonthGridProps {
  items: Item[];
  /** First of the month currently shown. */
  month: Date;
  selectedDay: Date | null;
  onSelectDay: (date: Date | null) => void;
  onChangeMonth: (delta: number) => void;
  today?: Date;
}

/**
 * Itsycal-style month: a weekday header over six fixed rows, today ringed,
 * days carrying items marked with a dot. Clicking a day filters the list.
 */
export function MonthGrid({
  items,
  month,
  selectedDay,
  onSelectDay,
  onChangeMonth,
  today = new Date(),
}: MonthGridProps) {
  const weeks = monthGrid(month);
  const counts = countByDay(items);

  return (
    <div className="month-grid">
      <div className="month-header">
        <button type="button" className="month-nav" title="previous month"
          onClick={() => onChangeMonth(-1)}>‹</button>
        <span className="month-title">{monthHeading(month)}</span>
        <button type="button" className="month-nav" title="next month"
          onClick={() => onChangeMonth(1)}>›</button>
      </div>

      <div className="month-weekdays">
        {WEEKDAY_INITIALS.map((initial, i) => (
          <span
            key={i}
            className={`month-weekday${i === 0 || i === 6 ? " month-weekday--weekend" : ""}`}
          >
            {initial}
          </span>
        ))}
      </div>

      {weeks.map((week, w) => (
        <div key={w} className="month-week">
          {week.map((date) => {
            const count = counts[dayKey(date)] ?? 0;
            const outside = !isSameMonth(date, month);
            const isToday = isSameDay(date, today);
            const isSelected = !!selectedDay && isSameDay(date, selectedDay);
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            return (
              <button
                key={dayKey(date)}
                type="button"
                className={
                  "month-day" +
                  (isWeekend ? " month-day--weekend" : "") +
                  (outside ? " month-day--outside" : "") +
                  (isToday ? " month-day--today" : "") +
                  (isSelected ? " month-day--selected" : "")
                }
                title={date.toDateString()}
                onClick={() => onSelectDay(isSelected ? null : date)}
              >
                <span className="month-day-number">{date.getDate()}</span>
                <span className={`month-day-dot${count > 0 ? " month-day-dot--on" : ""}`} />
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
