import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HomePage } from "../pages/HomePage";
import { renderWithRouter } from "./renderWithRouter";

describe("HomePage", () => {
  it("renders the value proposition and booking links", () => {
    renderWithRouter(<HomePage />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Записывайтесь на звонок в удобное время",
      }),
    ).toBeInTheDocument();

    const bookingLinks = screen.getAllByRole("link", {
      name: "Записаться на звонок",
    });

    expect(bookingLinks.length).toBeGreaterThanOrEqual(2);
    for (const link of bookingLinks) {
      expect(link).toHaveAttribute("href", "/book");
    }
  });

  it("links to the how-it-works section", () => {
    renderWithRouter(<HomePage />);

    expect(
      screen.getByRole("link", { name: "Как это работает" }),
    ).toHaveAttribute("href", "#how-it-works");
  });
});
