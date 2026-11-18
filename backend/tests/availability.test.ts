import { describe, expect, it } from "vitest";
import {
  type Slot,
  buildSlots,
  getWindowBounds,
} from "../src/domain/availability.js";

const MONDAY_0800_MSK = Date.parse("2026-11-16T05:00:00.000Z");

function starts(days: Array<{ slots: Slot[] }>, dayIndex = 0): string[] {
  return days[dayIndex].slots.map((slot) => slot.start);
}

describe("buildSlots", () => {
  it("builds 14 Moscow calendar days from the injected now", () => {
    const days = buildSlots(MONDAY_0800_MSK, 30, []);

    expect(days).toHaveLength(14);
    expect(days[0].date).toBe("2026-11-16");
    expect(days[13].date).toBe("2026-11-29");
    expect(days[0].slots[0]).toEqual({
      start: "2026-11-16T06:00:00.000Z",
      end: "2026-11-16T06:30:00.000Z",
    });
    expect(days[0].slots.at(-1)).toEqual({
      start: "2026-11-16T14:30:00.000Z",
      end: "2026-11-16T15:00:00.000Z",
    });
  });

  it("drops past slots today but keeps the whole window", () => {
    const at1215 = buildSlots(Date.parse("2026-11-16T09:15:00.000Z"), 30, []);
    const at1200 = buildSlots(Date.parse("2026-11-16T09:00:00.000Z"), 30, []);

    expect(starts(at1215)[0]).toBe("2026-11-16T09:30:00.000Z");
    expect(starts(at1200)).not.toContain("2026-11-16T09:00:00.000Z");
    expect(starts(at1200)[0]).toBe("2026-11-16T09:30:00.000Z");
    expect(at1215[13].date).toBe("2026-11-29");
  });

  it("returns an empty today after 18:00 and normal slots tomorrow", () => {
    const days = buildSlots(Date.parse("2026-11-16T15:30:00.000Z"), 30, []);

    expect(days[0].date).toBe("2026-11-16");
    expect(days[0].slots).toEqual([]);
    expect(starts(days, 1)[0]).toBe("2026-11-17T06:00:00.000Z");
  });

  it("keeps weekends in the window with empty slot lists", () => {
    const days = buildSlots(Date.parse("2026-11-21T07:00:00.000Z"), 30, []);

    expect(days[0].date).toBe("2026-11-21");
    expect(days[0].slots).toEqual([]);
    expect(days[1].date).toBe("2026-11-22");
    expect(days[1].slots).toEqual([]);
    expect(starts(days, 2)[0]).toBe("2026-11-23T06:00:00.000Z");
  });

  it("uses the last valid start for each duration", () => {
    const cases: Array<[number, string, string]> = [
      [30, "2026-11-16T14:30:00.000Z", "2026-11-16T15:00:00.000Z"],
      [45, "2026-11-16T14:00:00.000Z", "2026-11-16T14:45:00.000Z"],
      [60, "2026-11-16T14:00:00.000Z", "2026-11-16T15:00:00.000Z"],
      [540, "2026-11-16T06:00:00.000Z", "2026-11-16T15:00:00.000Z"],
    ];

    for (const [durationMin, start, end] of cases) {
      const slots = buildSlots(MONDAY_0800_MSK, durationMin, [])[0].slots;
      expect(slots.at(-1)).toEqual({ start, end });
    }
  });

  it("excludes overlapping busy intervals and allows adjacency", () => {
    const busy = [
      {
        startMs: Date.parse("2026-11-16T07:00:00.000Z"),
        endMs: Date.parse("2026-11-16T08:00:00.000Z"),
      },
    ];

    const slots = starts(buildSlots(MONDAY_0800_MSK, 30, busy));

    expect(slots).toContain("2026-11-16T06:30:00.000Z");
    expect(slots).not.toContain("2026-11-16T07:00:00.000Z");
    expect(slots).not.toContain("2026-11-16T07:30:00.000Z");
    expect(slots).toContain("2026-11-16T08:00:00.000Z");
  });

  it("returns an empty day when the whole working day is busy", () => {
    const busy = [
      {
        startMs: Date.parse("2026-11-16T06:00:00.000Z"),
        endMs: Date.parse("2026-11-16T15:00:00.000Z"),
      },
    ];

    expect(buildSlots(MONDAY_0800_MSK, 30, busy)[0].slots).toEqual([]);
  });

  it("anchors the window to Moscow time near midnight UTC", () => {
    const nowMs = Date.parse("2026-11-14T21:30:00.000Z");
    const days = buildSlots(nowMs, 30, []);

    expect(days[0].date).toBe("2026-11-15");
    expect(days[13].date).toBe("2026-11-28");
    expect(getWindowBounds(nowMs)).toEqual({
      windowStartMs: Date.parse("2026-11-14T21:00:00.000Z"),
      windowEndMs: Date.parse("2026-11-28T21:00:00.000Z"),
    });
  });
});
