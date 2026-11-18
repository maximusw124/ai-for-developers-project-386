import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BookingPage } from "../pages/BookingPage";
import { renderWithRouter } from "./renderWithRouter";

const { listPublicMeetingTypes, getPublicMeetingType } = vi.hoisted(() => ({
  listPublicMeetingTypes: vi.fn(),
  getPublicMeetingType: vi.fn(),
}));

vi.mock("../api/generated/sdk.gen", () => ({
  listPublicMeetingTypes: (...args: unknown[]) =>
    listPublicMeetingTypes(...args),
  getPublicMeetingType: (...args: unknown[]) => getPublicMeetingType(...args),
}));

describe("BookingPage", () => {
  beforeEach(() => {
    listPublicMeetingTypes.mockReset();
  });

  it("renders the empty state from the generated SDK data", async () => {
    listPublicMeetingTypes.mockResolvedValue({ data: [], error: undefined });

    renderWithRouter(<BookingPage />, { initialPath: "/book" });

    expect(
      screen.getByRole("heading", { level: 1, name: "Запись на встречу" }),
    ).toBeInTheDocument();

    expect(
      await screen.findByText("Пока нет доступных типов встреч."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Владелец ещё не опубликовал ни одного типа встреч."),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("link", { name: "Вернуться на главную" }),
    ).toHaveAttribute("href", "/");
  });

  it("renders meeting types returned by the SDK", async () => {
    listPublicMeetingTypes.mockResolvedValue({
      data: [
        {
          id: 1,
          name: "Консультация",
          description: "Разбор задачи",
          durationMin: 45,
        },
      ],
      error: undefined,
    });

    renderWithRouter(<BookingPage />, { initialPath: "/book" });

    expect(
      await screen.findByRole("heading", { level: 3, name: "Консультация" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Разбор задачи")).toBeInTheDocument();
    expect(screen.getByText("45 мин")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Консультация" })).toHaveAttribute(
      "href",
      "/book/1",
    );
  });

  it("shows an error alert when the SDK request fails", async () => {
    listPublicMeetingTypes.mockResolvedValue({
      data: undefined,
      error: new Error("network"),
    });

    renderWithRouter(<BookingPage />, { initialPath: "/book" });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Не удалось загрузить типы встреч. Обновите страницу.",
    );
  });
});
