import { useEffect, useState } from "react";
import type { DayAvailability, Slot } from "../api/generated/types.gen";
import "./AvailabilityPicker.css";

const DATE_FORMATTER = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const TIME_FORMATTER = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatMoscowTime(instant: string): string {
  return TIME_FORMATTER.format(new Date(instant));
}

export function formatMoscowInterval(slot: Slot): string {
  return `${formatMoscowTime(slot.start)}–${formatMoscowTime(slot.end)}`;
}

function formatDate(date: string): string {
  return DATE_FORMATTER.format(new Date(`${date}T00:00:00.000Z`));
}

type AvailabilityPickerProps = {
  days: DayAvailability[];
  selectedSlotStart?: string;
  onSelectSlot: (slot: Slot) => void;
};

export function AvailabilityPicker({
  days,
  selectedSlotStart,
  onSelectSlot,
}: AvailabilityPickerProps) {
  const firstDayWithSlots =
    days.find((day) => day.slots.length > 0)?.date ?? days[0]?.date ?? "";
  const [selectedDate, setSelectedDate] = useState(firstDayWithSlots);

  useEffect(() => {
    if (days.length > 0 && !days.some((day) => day.date === selectedDate)) {
      setSelectedDate(firstDayWithSlots);
    }
  }, [days, firstDayWithSlots, selectedDate]);

  const selectedDay = days.find((day) => day.date === selectedDate);

  return (
    <div className="availability">
      <h3>Выберите дату и время</h3>
      <p className="availability__hint">
        Все время указано по Москве (Europe/Moscow).
      </p>
      <fieldset className="availability__dates">
        <legend className="availability__legend">Даты записи</legend>
        <div className="availability__date-list">
          {days.map((day) => (
            <button
              key={day.date}
              type="button"
              className="availability__date"
              aria-pressed={day.date === selectedDate}
              aria-label={`${formatDate(day.date)}, ${day.date}, ${
                day.slots.length === 0
                  ? "нет свободных слотов"
                  : `${day.slots.length} свободных слотов`
              }`}
              onClick={() => setSelectedDate(day.date)}
            >
              <span>{formatDate(day.date)}</span>
              <small>
                {day.slots.length === 0
                  ? "нет времени"
                  : `${day.slots.length} слотов`}
              </small>
            </button>
          ))}
        </div>
      </fieldset>
      <div className="availability__day" aria-live="polite">
        {selectedDay?.slots.length === 0 ? (
          <p>На этот день нет свободного времени.</p>
        ) : null}
        {selectedDay && selectedDay.slots.length > 0 ? (
          <ul className="availability__slots" aria-label="Свободные слоты">
            {selectedDay.slots.map((slot) => (
              <li key={slot.start}>
                <button
                  type="button"
                  className="availability__slot"
                  aria-pressed={slot.start === selectedSlotStart}
                  aria-label={`${formatMoscowInterval(slot)}, ${formatDate(
                    selectedDay.date,
                  )}, по Москве`}
                  onClick={() => onSelectSlot(slot)}
                >
                  {formatMoscowInterval(slot)}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
