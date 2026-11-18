import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DayAvailability } from "../api/generated/types.gen";
import { AvailabilityPicker } from "../components/AvailabilityPicker";

const SLOT = {
  start: "2026-11-16T06:00:00.000Z",
  end: "2026-11-16T06:30:00.000Z",
};

const DAYS: DayAvailability[] = Array.from({ length: 14 }, (_, index) => {
  const date = new Date(Date.UTC(2026, 10, 16 + index))
    .toISOString()
    .slice(0, 10);
  return {
    date,
    slots: index === 0 ? [SLOT] : [],
  };
});

describe("AvailabilityPicker", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders 14 dates and selects the first day with slots by default", () => {
    render(<AvailabilityPicker days={DAYS} onSelectSlot={vi.fn()} />);

    const dateStrip = screen.getByRole("group", { name: "Даты записи" });
    expect(
      within(dateStrip).getAllByRole("button", { name: /ноября 2026/ }),
    ).toHaveLength(14);
    expect(
      within(dateStrip).getByRole("button", {
        name: /понедельник, 16 ноября 2026/,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: /09:00–09:30/ }),
    ).toBeInTheDocument();
  });

  it("shows an empty state for a day without slots", () => {
    render(<AvailabilityPicker days={DAYS} onSelectSlot={vi.fn()} />);

    fireEvent.click(
      screen.getByRole("button", { name: /суббота, 21 ноября 2026/ }),
    );

    expect(
      screen.getByText("На этот день нет свободного времени."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /09:00–09:30/ })).toBeNull();
  });

  it("reports the selected slot", () => {
    const onSelectSlot = vi.fn();
    render(<AvailabilityPicker days={DAYS} onSelectSlot={onSelectSlot} />);

    fireEvent.click(screen.getByRole("button", { name: /09:00–09:30/ }));

    expect(onSelectSlot).toHaveBeenCalledWith(SLOT);
  });

  it("formats slot time in Moscow even in another process timezone", () => {
    vi.stubEnv("TZ", "America/New_York");
    render(<AvailabilityPicker days={DAYS} onSelectSlot={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: /09:00–09:30.*по Москве/ }),
    ).toBeInTheDocument();
  });
});
