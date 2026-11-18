import { DateTime } from "luxon";
import {
  SLOT_STEP_MIN,
  WORK_END_MIN,
  WORK_START_MIN,
  ZONE,
  getWindowBounds,
} from "./availability.js";

export function isBookableStart(
  nowMs: number,
  startMs: number,
  durationMin: number,
): boolean {
  if (!Number.isFinite(startMs) || !Number.isInteger(startMs)) return false;

  const start = DateTime.fromMillis(startMs, { zone: ZONE });
  if (!start.isValid) return false;

  const { windowStartMs, windowEndMs } = getWindowBounds(nowMs);
  if (startMs <= nowMs || startMs < windowStartMs || startMs >= windowEndMs) {
    return false;
  }
  if (start.weekday < 1 || start.weekday > 5) return false;
  if (start.second !== 0 || start.millisecond !== 0) return false;

  const minute = start.hour * 60 + start.minute;
  if (minute < WORK_START_MIN) return false;
  if ((minute - WORK_START_MIN) % SLOT_STEP_MIN !== 0) return false;
  if (minute + durationMin > WORK_END_MIN) return false;

  return true;
}

export function overlapGuardsDisabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.NODE_ENV === "test" && env.TEST_BREAK_OVERLAP === "1";
}
