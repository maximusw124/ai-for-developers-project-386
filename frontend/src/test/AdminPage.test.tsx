import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import {
  type Mock,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { UpcomingBooking } from "../api/generated/types.gen";
import { AdminPage } from "../pages/AdminPage";
import { renderWithRouter } from "./renderWithRouter";

const api = vi.hoisted(() => ({
  getOwner: vi.fn(),
  updateOwner: vi.fn(),
  listAdminMeetingTypes: vi.fn(),
  listUpcomingBookings: vi.fn(),
  createMeetingType: vi.fn(),
  updateMeetingType: vi.fn(),
  archiveMeetingType: vi.fn(),
  restoreMeetingType: vi.fn(),
}));

vi.mock("../api/generated/sdk.gen", () => api);

describe("AdminPage", () => {
  const NOW = Date.parse("2026-11-16T05:00:00.000Z");
  const EMPTY_UPCOMING =
    "Предстоящих встреч нет. Когда гости запишутся, встречи появятся здесь";

  const upcomingSection = () =>
    screen.getByRole("region", { name: "Предстоящие встречи" });

  beforeEach(() => {
    for (const fn of Object.values(api)) (fn as Mock).mockReset();
    api.getOwner.mockResolvedValue({
      data: { displayName: "Owner" },
      error: undefined,
    });
    api.listAdminMeetingTypes.mockResolvedValue({ data: [], error: undefined });
    api.listUpcomingBookings.mockResolvedValue({ data: [], error: undefined });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function booking(overrides: Partial<UpcomingBooking> = {}): UpcomingBooking {
    return {
      id: 1,
      start: "2026-11-16T20:30:00.000Z",
      end: "2026-11-16T21:00:00.000Z",
      guestName: "First",
      guestEmail: "first@example.com",
      comment: null,
      createdAt: "2026-11-16T05:00:00.000Z",
      meetingType: {
        id: 1,
        name: "Consultation",
        durationMin: 30,
        archived: false,
      },
      ...overrides,
    };
  }

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

  it("shows skeletons while upcoming bookings load and then the empty state", async () => {
    let release: (() => void) | undefined;
    api.listUpcomingBookings.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ data: [], error: undefined });
        }),
    );
    renderWithRouter(<AdminPage />, { initialPath: "/admin" });

    const section = upcomingSection();
    expect(within(section).getByRole("status")).toBeInTheDocument();
    expect(within(section).getByText("Загрузка встреч…")).toBeInTheDocument();

    release?.();
    expect(
      await within(section).findByText(EMPTY_UPCOMING),
    ).toBeInTheDocument();
    expect(within(section).queryByRole("status")).not.toBeInTheDocument();
  });

  it("groups bookings by Moscow date and shows details, badges and mailto links", async () => {
    api.listUpcomingBookings.mockResolvedValue({
      data: [
        booking({
          id: 2,
          start: "2026-11-16T21:30:00.000Z",
          end: "2026-11-16T22:00:00.000Z",
          guestName: "Second",
          guestEmail: "second@example.com",
          comment: "Комментарий гостя",
          meetingType: {
            id: 2,
            name: "Archived meeting",
            durationMin: 60,
            archived: true,
          },
        }),
        booking(),
      ],
      error: undefined,
    });
    renderWithRouter(<AdminPage />, { initialPath: "/admin" });

    const section = upcomingSection();
    await within(section).findByText("Consultation");
    const dates = within(section)
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent);
    expect(dates).toHaveLength(2);
    expect(dates[0]).toContain("16 ноября");
    expect(dates[1]).toContain("17 ноября");
    expect(within(section).getByText("Время по Москве")).toBeInTheDocument();
    expect(within(section).getByText("23:30–00:00")).toBeInTheDocument();
    expect(within(section).getByText("Second")).toBeInTheDocument();
    expect(within(section).getByText("Комментарий гостя")).toBeInTheDocument();
    expect(within(section).getAllByText("Создана")).toHaveLength(2);
    expect(within(section).getByText("Тип в архиве")).toBeInTheDocument();
    expect(
      within(section).getByRole("link", { name: "first@example.com" }),
    ).toHaveAttribute("href", "mailto:first@example.com");
  });

  it("marks a meeting that is in progress and not a future one", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    api.listUpcomingBookings.mockResolvedValue({
      data: [
        booking({
          id: 1,
          guestName: "Ongoing",
          start: new Date(NOW - 5 * 60_000).toISOString(),
          end: new Date(NOW + 25 * 60_000).toISOString(),
        }),
        booking({
          id: 2,
          guestName: "Future",
          start: new Date(NOW + 2 * 3_600_000).toISOString(),
          end: new Date(NOW + 2.5 * 3_600_000).toISOString(),
        }),
      ],
      error: undefined,
    });
    renderWithRouter(<AdminPage />, { initialPath: "/admin" });

    const section = upcomingSection();
    expect(await within(section).findByText("Ongoing")).toBeInTheDocument();
    expect(within(section).getByText("Future")).toBeInTheDocument();
    expect(within(section).getAllByText("Сейчас")).toHaveLength(1);
  });

  it("refreshes upcoming bookings manually without polling", async () => {
    renderWithRouter(<AdminPage />, { initialPath: "/admin" });
    const section = upcomingSection();
    await within(section).findByText(EMPTY_UPCOMING);
    expect(api.listUpcomingBookings).toHaveBeenCalledTimes(1);

    fireEvent.click(within(section).getByRole("button", { name: "Обновить" }));
    await waitFor(() =>
      expect(api.listUpcomingBookings).toHaveBeenCalledTimes(2),
    );
    expect(
      await within(section).findByText(EMPTY_UPCOMING),
    ).toBeInTheDocument();
  });

  it("keeps other sections visible and recovers from an upcoming error", async () => {
    api.listUpcomingBookings
      .mockResolvedValueOnce({
        data: undefined,
        error: { code: "internal_error", message: "Boom upcoming" },
      })
      .mockResolvedValueOnce({
        data: [booking({ guestName: "Recovered" })],
        error: undefined,
      });
    renderWithRouter(<AdminPage />, { initialPath: "/admin" });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Boom upcoming");
    expect(await screen.findByLabelText("Имя владельца")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Типы встреч" }),
    ).toBeInTheDocument();
    fireEvent.click(within(alert).getByRole("button", { name: "Повторить" }));

    expect(
      await within(upcomingSection()).findByText("Recovered"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
