import { Item } from "../types";
import {
  countByDay,
  dayKey,
  isSameDay,
  monthHeading,
  weekDays,
  weekRangeHeading,
  WEEKDAY_INITIALS,
} from "../lib/calendarGrid";
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "./Icons";

interface WeekStripProps {
  items: Item[];
  /** Any date inside the week being shown. */
  week: Date;
  /** Null means "no day picked — show the normal sections". */
  selectedDay: Date | null;
  onSelectDay: (date: Date | null) => void;
  onChangeWeek: (delta: number) => void;
  /** Switches to the month grid — the month title doubles as that control. */
  onToggleMonth: () => void;
  today?: Date;
}

/**
 * One week as seven clickable day cells under a month title, with ‹ Today ›
 * to page between weeks. Clicking a day starts the list there.
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
      <div className="cal-header">
        <button
          type="button"
          className="cal-title"
          title={`${weekRangeHeading(days, today)} · show month [m]`}
          onClick={onToggleMonth}
        >
          {monthHeading(days[3])}
          <ChevronDownIcon />
        </button>
        <div className="cal-nav">
          <button type="button" className="cal-nav-btn" aria-label="previous week" title="previous week [←]"
            onClick={() => onChangeWeek(-1)}><ChevronLeftIcon /></button>
          <button type="button" className="cal-today" disabled={isCurrentWeek}
            title="back to this week [T]" onClick={() => onChangeWeek(0)}>Today</button>
          <button type="button" className="cal-nav-btn" aria-label="next week" title="next week [→]"
            onClick={() => onChangeWeek(1)}><ChevronRightIcon /></button>
        </div>
      </div>

      <div className="week-days">
        {days.map((date, i) => {
          const count = counts[dayKey(date)] ?? 0;
          const isToday = isSameDay(date, today);
          const isSelected = !!selectedDay && isSameDay(date, selectedDay);
          const isPast = date < today && !isToday;
          return (
            <button
              key={dayKey(date)}
              type="button"
              className={
                "week-day" +
                (isPast ? " week-day--past" : "") +
                (isToday ? " week-day--today" : "") +
                (isSelected ? " week-day--selected" : "")
              }
              title={`${date.toDateString()}${count ? ` · ${count} item${count === 1 ? "" : "s"}` : ""}`}
              aria-pressed={isSelected}
              onClick={() => onSelectDay(isSelected ? null : date)}
            >
              <span className="week-day-initial">{WEEKDAY_INITIALS[i]}</span>
              <span className="week-day-number">{date.getDate()}</span>
              <span className={`day-dot${count > 0 ? " day-dot--on" : ""}`} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
