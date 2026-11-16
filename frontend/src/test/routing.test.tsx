import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "../App";
import { renderWithRouter } from "./renderWithRouter";

vi.mock("../api/generated/sdk.gen", () => ({
  listPublicMeetingTypes: vi.fn().mockResolvedValue({
    data: [],
    error: undefined,
  }),
}));

describe("App routing", () => {
  it("renders the home page at /", () => {
    renderWithRouter(<App />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Записывайтесь на звонок в удобное время",
    );
  });

  it("renders the booking page at /book", async () => {
    renderWithRouter(<App />, { initialPath: "/book" });

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Запись на встречу",
    );
    expect(
      await screen.findByText("Пока нет доступных типов встреч."),
    ).toBeInTheDocument();
  });
});
