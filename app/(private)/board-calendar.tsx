"use client";

import { useState, type RefObject } from "react";
import type { BoardColumnView } from "./board-client";

const monthFormat = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const dayFormat = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const firstDay = () => {
  const now = new Date();
  now.setUTCDate(1);
  now.setUTCHours(0, 0, 0, 0);
  return now;
};

type Props = {
  columns: BoardColumnView[];
  headingRef: RefObject<HTMLHeadingElement | null>;
  onOpen: (id: string, trigger: HTMLButtonElement) => void;
};

export function BoardCalendar({ columns, headingRef, onOpen }: Props) {
  const [month, setMonth] = useState(firstDay);
  const monthKey = dateKey(month).slice(0, 7);
  const today = dateKey(new Date());
  const days = new Map<string, { id: string; title: string; list: string }[]>();
  for (const column of columns) {
    for (const card of column.cards) {
      if (!card.dueDate?.startsWith(monthKey)) continue;
      const key = card.dueDate.slice(0, 10);
      days.set(key, [...(days.get(key) ?? []), { id: card.id, title: card.title, list: column.name }]);
    }
  }

  function changeMonth(offset: number) {
    const next = new Date(month);
    next.setUTCMonth(month.getUTCMonth() + offset);
    setMonth(next);
  }

  function renderDay(date: Date, agenda: boolean) {
    const key = dateKey(date);
    return <li className="calendar-day" key={key} data-date={key} aria-label={dayFormat.format(date)} aria-current={key === today ? "date" : undefined}>
      <span className="calendar-day-label">{agenda ? dayFormat.format(date) : date.getUTCDate()}</span>
      {days.get(key)?.map((card) => <button className="calendar-card" type="button" key={card.id} onClick={(event) => onOpen(card.id, event.currentTarget)}>
        <span>{card.title}</span><small>{card.list}</small>
      </button>)}
    </li>;
  }

  const monthDays: Date[] = [];
  for (const date = new Date(month); date.getUTCMonth() === month.getUTCMonth(); date.setUTCDate(date.getUTCDate() + 1)) {
    monthDays.push(new Date(date));
  }

  return <section className="editorial-calendar" aria-labelledby="calendar-month">
    <div className="calendar-toolbar">
      <h2 id="calendar-month" ref={headingRef} tabIndex={-1} aria-live="polite">{monthFormat.format(month)}</h2>
      <div className="calendar-navigation" aria-label="Month navigation" role="group">
        <button className="button-quiet" type="button" onClick={() => changeMonth(-1)} aria-label="Previous month">←</button>
        <button className="button-quiet" type="button" onClick={() => setMonth(firstDay())}>Today</button>
        <button className="button-quiet" type="button" onClick={() => changeMonth(1)} aria-label="Next month">→</button>
      </div>
    </div>
    {days.size === 0 && <p className="calendar-empty" role="status">No cards are due this month.</p>}
    <div className="calendar-month">
      <div className="calendar-weekdays" aria-hidden="true">{weekdays.map((day) => <span key={day}>{day}</span>)}</div>
      <ol className="calendar-grid" aria-label="Month grid">
        {Array.from({ length: month.getUTCDay() }, (_, index) => <li className="calendar-padding-day" key={index} aria-hidden="true" />)}
        {monthDays.map((date) => renderDay(date, false))}
      </ol>
    </div>
    {days.size > 0 && <ol className="calendar-agenda" aria-label="Calendar agenda">
      {monthDays.filter((date) => days.has(dateKey(date))).map((date) => renderDay(date, true))}
    </ol>}
  </section>;
}
