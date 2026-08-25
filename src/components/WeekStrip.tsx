import { Item } from "../types";
import {
  countByDay,
  dayKey,
  isSameDay,
  weekDays,
  weekRangeHeading,
  WEEKDAY_INITIALS,
} from "../lib/calendarGrid";

interface WeekStripProps {
  items: Item[];
  /** Any date inside the week being shown. */
  week: Date;
  /** Null means "no day picked — show the normal sections". */
  selectedDay: Date | null;
  onSelectDay: (date: Date | null) => void;
  onChangeWeek: (delta: number) => void;
  /** Switches to the month grid — the date range doubles as that control. */
  onToggleMonth: () => void;
  today?: Date;
}

/**
 * One week as seven clickable cells, with a date-range header and arrows to
 * page between weeks. Clicking a day starts the list there.
 */
export function WeekStrip({
  items,
  week,
  selectedDay,
  onSelectDay,
  onChangeWeek,
  onToggleMonth,
  today = new Date(),
}: WeekStripProps) {
  const days = weekDays(week);
  const counts = countByDay(items);
  const isCurrentWeek = days.some((d) => isSameDay(d, today));

  return (
    <div className="week-strip">
      <div className="week-header">
        <button type="button" className="month-nav" title="previous week [←]"
          onClick={() => onChangeWeek(-1)}>‹</button>
        <span className="week-title">
          <button
            type="button"
            className="week-title-btn"
            title="show month [m]"
            onClick={onToggleMonth}
          >
            {weekRangeHeading(days, today)}
          </button>
          {!isCurrentWeek && (
            <button
              type="button"
              className="week-today"
              title="back to this week"
              onClick={() => onChangeWeek(0)}
            >
              today
            </button>
          )}
        </span>
        <button type="button" className="month-nav" title="next week [→]"
          onClick={() => onChangeWeek(1)}>›</button>
      </div>

      <div className="week-days">
        {days.map((date, i) => {
          const count = counts[dayKey(date)] ?? 0;
          const isToday = isSameDay(date, today);
          const isSelected = !!selectedDay && isSameDay(date, selectedDay);
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;
          return (
            <button
              key={dayKey(date)}
              type="button"
              className={
                "week-day" +
                (isWeekend ? " week-day--weekend" : "") +
                (isToday ? " week-day--today" : "") +
                (isSelected ? " week-day--selected" : "")
              }
              title={date.toDateString()}
              onClick={() => onSelectDay(isSelected ? null : date)}
            >
              <span className="week-day-initial">{WEEKDAY_INITIALS[i]}</span>
              <span className="week-day-number">{date.getDate()}</span>
              <span className={`week-day-dot${count > 0 ? " week-day-dot--on" : ""}`} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
