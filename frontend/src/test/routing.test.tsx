import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "../App";
import { renderWithRouter } from "./renderWithRouter";

describe("App routing", () => {
  it("renders the home page at /", () => {
    renderWithRouter(<App />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Записывайтесь на звонок в удобное время",
    );
  });

  it("renders the booking stub at /book", () => {
    renderWithRouter(<App />, { initialPath: "/book" });

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Запись на звонок",
    );
  });
});
