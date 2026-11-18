import { DateTime } from "luxon";
import type { DayAvailability, Slot } from "../api/generated/types.gen.js";

export const ZONE = "Europe/Moscow";
export const WINDOW_DAYS = 14;
export const WORK_START_MIN = 9 * 60;
export const WORK_END_MIN = 18 * 60;
export const SLOT_STEP_MIN = 30;

export type Clock = { now: () => number };

export const systemClock: Clock = { now: () => Date.now() };

export type BusyInterval = { startMs: number; endMs: number };

export function getWindowBounds(nowMs: number): {
  windowStartMs: number;
  windowEndMs: number;
} {
  const today = DateTime.fromMillis(nowMs, { zone: ZONE }).startOf("day");
  return {
    windowStartMs: today.toMillis(),
    windowEndMs: today.plus({ days: WINDOW_DAYS }).toMillis(),
  };
}

export function buildSlots(
  nowMs: number,
  durationMin: number,
  busy: BusyInterval[],
): DayAvailability[] {
  const today = DateTime.fromMillis(nowMs, { zone: ZONE }).startOf("day");
  const days: DayAvailability[] = [];

  for (let offset = 0; offset < WINDOW_DAYS; offset += 1) {
    const day = today.plus({ days: offset });
    const slots: Slot[] = [];

    if (day.weekday >= 1 && day.weekday <= 5) {
      for (
        let minute = WORK_START_MIN;
        minute + durationMin <= WORK_END_MIN;
        minute += SLOT_STEP_MIN
      ) {
        const start = day.plus({ minutes: minute });
        const startMs = start.toMillis();
        if (startMs <= nowMs) continue;

        const endMs = start.plus({ minutes: durationMin }).toMillis();
        if (busy.some((b) => b.startMs < endMs && b.endMs > startMs)) continue;

        slots.push({
          start: new Date(startMs).toISOString(),
          end: new Date(endMs).toISOString(),
        });
      }
    }

    days.push({ date: day.toFormat("yyyy-MM-dd"), slots });
  }

  return days;
}
