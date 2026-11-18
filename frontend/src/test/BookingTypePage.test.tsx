import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BookingTypePage } from "../pages/BookingTypePage";

const { getAvailability, createBooking } = vi.hoisted(() => ({
  getAvailability: vi.fn(),
  createBooking: vi.fn(),
}));

vi.mock("../api/generated/sdk.gen", () => ({
  getAvailability: (...args: unknown[]) => getAvailability(...args),
  createBooking: (...args: unknown[]) => createBooking(...args),
}));

const slot = {
  start: "2026-11-16T06:00:00.000Z",
  end: "2026-11-16T06:30:00.000Z",
};

function makeAvailability(firstDaySlots: (typeof slot)[] = [slot]) {
  return {
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
      return { date, slots: index === 0 ? firstDaySlots : [] };
    }),
  };
}

const confirmation = {
  meetingType: makeAvailability().meetingType,
  start: slot.start,
  end: slot.end,
  durationMin: 30,
  ownerName: "Иван",
  guestName: "Анна",
  guestEmail: "anna@example.com",
  comment: "Вопрос",
  createdAt: "2026-11-16T05:00:00.000Z",
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

async function selectSlot() {
  await screen.findByRole("heading", { level: 2, name: "Консультация" });
  fireEvent.click(screen.getByRole("button", { name: /09:00–09:30/ }));
  await screen.findByRole("button", { name: "Подтвердить запись" });
}

function fillGuest() {
  fireEvent.change(screen.getByLabelText("Имя"), {
    target: { value: "Анна" },
  });
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "anna@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Комментарий (необязательно)"), {
    target: { value: "Вопрос" },
  });
}

describe("BookingTypePage", () => {
  beforeEach(() => {
    getAvailability.mockReset();
    createBooking.mockReset();
    getAvailability.mockResolvedValue({
      data: makeAvailability(),
      error: undefined,
    });
  });

  it("loads availability for a direct link and reveals the form only after a slot is selected", async () => {
    renderBookingType("/book/1");

    expect(
      await screen.findByRole("heading", { level: 2, name: "Консультация" }),
    ).toBeInTheDocument();
    expect(getAvailability).toHaveBeenCalledWith({ path: { id: 1 } });
    expect(screen.getByText("30 мин")).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Даты записи" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Подтвердить запись" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /09:00–09:30/ }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Выбран слот: 09:00–09:30",
    );
    expect(
      screen.getByRole("group", { name: "Данные гостя" }),
    ).toBeInTheDocument();
  });

  it("creates a booking and shows the confirmation with Moscow time and no-email notice", async () => {
    createBooking.mockResolvedValue({ data: confirmation, error: undefined });
    renderBookingType("/book/1");
    await selectSlot();
    fillGuest();

    fireEvent.click(screen.getByRole("button", { name: "Подтвердить запись" }));

    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Встреча забронирована",
      }),
    ).toBeInTheDocument();
    expect(createBooking).toHaveBeenCalledWith({
      body: {
        meetingTypeId: 1,
        start: slot.start,
        guestName: "Анна",
        guestEmail: "anna@example.com",
        comment: "Вопрос",
      },
    });
    expect(screen.getByText(/09:00–09:30/)).toBeInTheDocument();
    expect(screen.getByText("30 мин")).toBeInTheDocument();
    expect(screen.getByText("Иван")).toBeInTheDocument();
    expect(screen.getByText("anna@example.com")).toBeInTheDocument();
    expect(
      screen.getByText(/Письмо с подтверждением не отправляется/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Записаться ещё раз" }),
    ).toHaveAttribute("href", "/book");
  });

  it("keeps contacts, clears the slot and refreshes availability after a conflict", async () => {
    createBooking.mockResolvedValue({
      data: undefined,
      error: {
        code: "slot_taken",
        message: "The selected slot is already booked",
      },
    });
    getAvailability
      .mockResolvedValueOnce({ data: makeAvailability(), error: undefined })
      .mockResolvedValueOnce({
        data: makeAvailability([]),
        error: undefined,
      });
    renderBookingType("/book/1");
    await selectSlot();
    fillGuest();

    fireEvent.click(screen.getByRole("button", { name: "Подтвердить запись" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Это время уже занято. Выберите другое.");
    expect(alert).toHaveFocus();
    expect(screen.getByLabelText("Имя")).toHaveValue("Анна");
    expect(screen.getByLabelText("Email")).toHaveValue("anna@example.com");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(getAvailability).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /09:00–09:30/ }),
      ).not.toBeInTheDocument(),
    );
  });

  it("shows server field errors for invalid guest data", async () => {
    createBooking.mockResolvedValue({
      data: undefined,
      error: {
        code: "validation_error",
        message: "Validation failed",
        fieldErrors: [
          { field: "guestEmail", message: "Email must be a valid address" },
        ],
      },
    });
    renderBookingType("/book/1");
    await selectSlot();
    fillGuest();

    fireEvent.click(screen.getByRole("button", { name: "Подтвердить запись" }));

    expect(
      await screen.findByText("Email must be a valid address"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Выбран слот");
    expect(getAvailability).toHaveBeenCalledTimes(1);
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
