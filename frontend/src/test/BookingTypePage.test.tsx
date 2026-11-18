import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BookingTypePage } from "../pages/BookingTypePage";

const { getAvailability } = vi.hoisted(() => ({
  getAvailability: vi.fn(),
}));

vi.mock("../api/generated/sdk.gen", () => ({
  getAvailability: (...args: unknown[]) => getAvailability(...args),
}));

const availability = {
  meetingType: {
    id: 1,
    name: "Консультация",
    description: "Разбор задачи",
    durationMin: 30,
  },
  days: Array.from({ length: 14 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 10, 16 + index))
      .toISOString()
      .slice(0, 10);
    return {
      date,
      slots:
        index === 0
          ? [
              {
                start: "2026-11-16T06:00:00.000Z",
                end: "2026-11-16T06:30:00.000Z",
              },
            ]
          : [],
    };
  }),
};

function renderBookingType(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/book/:meetingTypeId" element={<BookingTypePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("BookingTypePage", () => {
  beforeEach(() => {
    getAvailability.mockReset();
  });

  it("loads availability for a direct link and lets the guest pick a slot", async () => {
    getAvailability.mockResolvedValue({
      data: availability,
      error: undefined,
    });

    renderBookingType("/book/1");

    expect(
      await screen.findByRole("heading", { level: 2, name: "Консультация" }),
    ).toBeInTheDocument();
    expect(getAvailability).toHaveBeenCalledWith({ path: { id: 1 } });
    expect(screen.getByText("30 мин")).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Даты записи" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /09:00–09:30/ }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Выбран слот: 09:00–09:30",
    );
  });

  it("shows a not-found state for archived or missing types", async () => {
    getAvailability.mockResolvedValue({
      data: undefined,
      error: { code: "not_found", message: "Meeting type not found" },
    });

    renderBookingType("/book/2");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Тип встречи не найден или больше не доступен для записи.",
    );
  });

  it("does not request availability with an invalid id", async () => {
    renderBookingType("/book/abc");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Тип встречи не найден или больше не доступен для записи.",
    );
    expect(getAvailability).not.toHaveBeenCalled();
  });
});
