import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BookingPage } from "../pages/BookingPage";
import { renderWithRouter } from "./renderWithRouter";

describe("BookingPage", () => {
  it("renders the booking stub and links back home", () => {
    renderWithRouter(<BookingPage />, { initialPath: "/book" });

    expect(
      screen.getByRole("heading", { level: 1, name: "Запись на звонок" }),
    ).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "← На главную" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      screen.getByRole("link", { name: "Вернуться на главную" }),
    ).toHaveAttribute("href", "/");
  });
});
