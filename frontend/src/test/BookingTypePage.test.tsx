import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BookingTypePage } from "../pages/BookingTypePage";

const { getPublicMeetingType } = vi.hoisted(() => ({
  getPublicMeetingType: vi.fn(),
}));

vi.mock("../api/generated/sdk.gen", () => ({
  getPublicMeetingType: (...args: unknown[]) => getPublicMeetingType(...args),
}));

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
    getPublicMeetingType.mockReset();
  });

  it("renders a public meeting type from a direct link", async () => {
    getPublicMeetingType.mockResolvedValue({
      data: {
        id: 1,
        name: "Консультация",
        description: "Разбор задачи",
        durationMin: 45,
      },
      error: undefined,
    });

    renderBookingType("/book/1");

    expect(
      await screen.findByRole("heading", { level: 2, name: "Консультация" }),
    ).toBeInTheDocument();
    expect(getPublicMeetingType).toHaveBeenCalledWith({ path: { id: 1 } });
    expect(screen.getByText("45 мин")).toBeInTheDocument();
  });

  it("shows a not-found state for archived or missing types", async () => {
    getPublicMeetingType.mockResolvedValue({
      data: undefined,
      error: { code: "not_found", message: "Meeting type not found" },
    });

    renderBookingType("/book/2");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Тип встречи не найден или больше не доступен для записи.",
    );
  });

  it("does not request a type with an invalid id", async () => {
    renderBookingType("/book/abc");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Тип встречи не найден или больше не доступен для записи.",
    );
    expect(getPublicMeetingType).not.toHaveBeenCalled();
  });
});
