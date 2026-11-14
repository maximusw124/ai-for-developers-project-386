import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";

type RenderWithRouterOptions = {
  initialPath?: string;
};

export function renderWithRouter(
  ui: ReactElement,
  { initialPath = "/" }: RenderWithRouterOptions = {},
) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>{ui}</MemoryRouter>,
  );
}
