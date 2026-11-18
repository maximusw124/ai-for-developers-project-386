import { fireEvent, screen, waitFor } from "@testing-library/react";
import { type Mock, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminPage } from "../pages/AdminPage";
import { renderWithRouter } from "./renderWithRouter";

const api = vi.hoisted(() => ({
  getOwner: vi.fn(),
  updateOwner: vi.fn(),
  listAdminMeetingTypes: vi.fn(),
  createMeetingType: vi.fn(),
  updateMeetingType: vi.fn(),
  archiveMeetingType: vi.fn(),
  restoreMeetingType: vi.fn(),
}));

vi.mock("../api/generated/sdk.gen", () => api);

describe("AdminPage", () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) (fn as Mock).mockReset();
    api.getOwner.mockResolvedValue({
      data: { displayName: "Owner" },
      error: undefined,
    });
    api.listAdminMeetingTypes.mockResolvedValue({ data: [], error: undefined });
  });

  it("renders demo banner, sections and profile form with label", async () => {
    renderWithRouter(<AdminPage />, { initialPath: "/admin" });
    expect(
      screen.getByRole("heading", { level: 1, name: "Админка" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Демо-режим/i)).toBeInTheDocument();
    expect(await screen.findByLabelText("Имя владельца")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Типы встреч" }),
    ).toBeInTheDocument();
  });

  it("shows owner validation errors with aria attributes and focus", async () => {
    api.updateOwner.mockResolvedValue({
      data: undefined,
      error: {
        code: "validation_error",
        message: "Validation failed",
        fieldErrors: [{ field: "displayName", message: "Name is required" }],
      },
    });
    renderWithRouter(<AdminPage />, { initialPath: "/admin" });
    const input = await screen.findByLabelText("Имя владельца");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(screen.getAllByRole("button", { name: "Сохранить" })[0]);
    expect(await screen.findByText("Name is required")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "owner-name-error");
  });

  it("announces owner save success via live region", async () => {
    api.updateOwner.mockResolvedValue({
      data: { displayName: "New" },
      error: undefined,
    });
    renderWithRouter(<AdminPage />, { initialPath: "/admin" });
    await screen.findByLabelText("Имя владельца");
    fireEvent.click(screen.getAllByRole("button", { name: "Сохранить" })[0]);
    await waitFor(() =>
      expect(screen.getByText("Имя владельца сохранено")).toBeInTheDocument(),
    );
  });

  it("creates meeting type and shows field errors on validation", async () => {
    api.createMeetingType.mockResolvedValueOnce({
      data: undefined,
      error: {
        code: "validation_error",
        message: "Validation failed",
        fieldErrors: [
          { field: "name", message: "Name must be 1..100 characters" },
        ],
      },
    });

    renderWithRouter(<AdminPage />, { initialPath: "/admin" });
    const name = await screen.findByLabelText("Название");
    fireEvent.change(name, { target: { value: "x" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Сохранить" })[1]);
    expect(
      await screen.findByText("Name must be 1..100 characters"),
    ).toBeInTheDocument();
    expect(name).toHaveAttribute("aria-invalid", "true");
  });

  it("shows server error in alert", async () => {
    api.getOwner.mockResolvedValue({
      data: undefined,
      error: { code: "internal_error", message: "Boom" },
    });
    renderWithRouter(<AdminPage />, { initialPath: "/admin" });
    expect(await screen.findByRole("alert")).toHaveTextContent("Boom");
  });

  it("lists active above archived", async () => {
    api.listAdminMeetingTypes.mockResolvedValue({
      data: [
        {
          id: 1,
          name: "Active",
          description: "",
          durationMin: 30,
          archivedAtMs: null,
        },
        {
          id: 2,
          name: "Old",
          description: "",
          durationMin: 30,
          archivedAtMs: 1,
        },
      ],
      error: undefined,
    });
    renderWithRouter(<AdminPage />, { initialPath: "/admin" });
    expect(await screen.findByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Old")).toBeInTheDocument();
    expect(screen.getByText("Активные")).toBeInTheDocument();
    expect(screen.getByText("Архивные")).toBeInTheDocument();
  });

  it("shows archived status as text and keeps archived types read-only", async () => {
    api.listAdminMeetingTypes.mockResolvedValue({
      data: [
        {
          id: 2,
          name: "Old",
          description: "Old description",
          durationMin: 30,
          archivedAtMs: 1,
        },
      ],
      error: undefined,
    });
    renderWithRouter(<AdminPage />, { initialPath: "/admin" });

    expect(await screen.findByText("Old")).toBeInTheDocument();
    expect(screen.getByText("Архив")).toBeInTheDocument();
    expect(
      screen.getByText("Архивный тип нельзя редактировать до восстановления."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Редактировать" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Восстановить" }),
    ).toBeInTheDocument();
  });

  it("asks for inline confirmation with warning and manages focus", async () => {
    api.listAdminMeetingTypes.mockResolvedValue({
      data: [
        {
          id: 1,
          name: "Active",
          description: "",
          durationMin: 30,
          archivedAtMs: null,
        },
      ],
      error: undefined,
    });
    renderWithRouter(<AdminPage />, { initialPath: "/admin" });

    await screen.findByText("Active");
    fireEvent.click(screen.getByRole("button", { name: "Архивировать" }));

    const warning = screen.getByText(
      "Тип исчезнет из записи, существующие встречи сохранятся.",
    );
    expect(warning).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Подтвердить архивацию" }),
    ).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(
      screen.queryByRole("button", { name: "Подтвердить архивацию" }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Архивировать" }),
      ).toHaveFocus(),
    );
  });

  it("archives a meeting type and announces the result", async () => {
    api.listAdminMeetingTypes.mockResolvedValue({
      data: [
        {
          id: 1,
          name: "Active",
          description: "",
          durationMin: 30,
          archivedAtMs: null,
        },
      ],
      error: undefined,
    });
    api.archiveMeetingType.mockResolvedValue({
      data: {
        id: 1,
        name: "Active",
        description: "",
        durationMin: 30,
        archivedAtMs: 123,
      },
      error: undefined,
    });
    renderWithRouter(<AdminPage />, { initialPath: "/admin" });

    await screen.findByText("Active");
    fireEvent.click(screen.getByRole("button", { name: "Архивировать" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Подтвердить архивацию" }),
    );

    await waitFor(() =>
      expect(api.archiveMeetingType).toHaveBeenCalledWith({ path: { id: 1 } }),
    );
    expect(
      await screen.findByText("Тип встречи архивирован"),
    ).toBeInTheDocument();
  });

  it("restores an archived meeting type and announces the result", async () => {
    api.listAdminMeetingTypes.mockResolvedValue({
      data: [
        {
          id: 2,
          name: "Old",
          description: "",
          durationMin: 30,
          archivedAtMs: 1,
        },
      ],
      error: undefined,
    });
    api.restoreMeetingType.mockResolvedValue({
      data: {
        id: 2,
        name: "Old",
        description: "",
        durationMin: 30,
        archivedAtMs: null,
      },
      error: undefined,
    });
    renderWithRouter(<AdminPage />, { initialPath: "/admin" });

    await screen.findByText("Old");
    fireEvent.click(screen.getByRole("button", { name: "Восстановить" }));

    await waitFor(() =>
      expect(api.restoreMeetingType).toHaveBeenCalledWith({ path: { id: 2 } }),
    );
    expect(
      await screen.findByText("Тип встречи восстановлен"),
    ).toBeInTheDocument();
  });
});
