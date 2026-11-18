import { describe, expect, it } from "vitest";
import { isBookableStart } from "../src/domain/booking.js";

const NOW = Date.parse("2026-11-16T05:00:00.000Z");
const msk = (iso: string) => Date.parse(iso);

describe("isBookableStart", () => {
  it("accepts the first grid slot in the Moscow working window", () => {
    expect(isBookableStart(NOW, msk("2026-11-16T06:00:00.000Z"), 30)).toBe(
      true,
    );
  });

  it("rejects past and non-grid starts", () => {
    expect(isBookableStart(NOW, NOW, 30)).toBe(false);
    expect(isBookableStart(NOW, msk("2026-11-16T04:30:00.000Z"), 30)).toBe(
      false,
    );
    expect(isBookableStart(NOW, msk("2026-11-16T06:15:00.000Z"), 30)).toBe(
      false,
    );
    expect(isBookableStart(NOW, msk("2026-11-16T06:00:01.000Z"), 30)).toBe(
      false,
    );
  });

  it("rejects weekends, slots outside working hours and late durations", () => {
    expect(isBookableStart(NOW, msk("2026-11-21T06:00:00.000Z"), 30)).toBe(
      false,
    );
    expect(isBookableStart(NOW, msk("2026-11-16T05:30:00.000Z"), 30)).toBe(
      false,
    );
    expect(isBookableStart(NOW, msk("2026-11-16T14:45:00.000Z"), 30)).toBe(
      false,
    );
    expect(isBookableStart(NOW, msk("2026-11-16T13:30:00.000Z"), 60)).toBe(
      true,
    );
    expect(isBookableStart(NOW, msk("2026-11-16T14:30:00.000Z"), 60)).toBe(
      false,
    );
  });

  it("rejects starts outside the 14-day window", () => {
    expect(isBookableStart(NOW, msk("2026-11-27T06:00:00.000Z"), 30)).toBe(
      true,
    );
    expect(isBookableStart(NOW, msk("2026-11-30T06:00:00.000Z"), 30)).toBe(
      false,
    );
    expect(isBookableStart(NOW, Number.NaN, 30)).toBe(false);
  });
});
