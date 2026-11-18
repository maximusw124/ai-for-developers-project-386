import { type Page, expect, test } from "@playwright/test";

const CONFLICT_SLOT_START = "2026-11-17T14:00:00.000Z";

async function createMeetingType(
  page: Page,
  name: string,
  durationMin = 30,
): Promise<number> {
  const created = await page.request.post("/api/admin/meeting-types", {
    data: {
      name,
      description: "Разбор задачи",
      durationMin,
    },
  });
  expect(created.status()).toBe(201);
  const { id } = await created.json();
  return id;
}

test("loads /book and shows availability on a direct link against the real backend", async ({
  page,
}) => {
  const response = await page.request.get("/api/meeting-types");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual([]);

  await page.goto("/book");

  await expect(
    page.getByRole("heading", { level: 1, name: "Запись на встречу" }),
  ).toBeVisible();
  await expect(
    page.getByText("Пока нет доступных типов встреч."),
  ).toBeVisible();

  const created = await page.request.post("/api/admin/meeting-types", {
    data: {
      name: "Консультация",
      description: "Разбор задачи",
      durationMin: 30,
    },
  });
  expect(created.status()).toBe(201);
  const { id } = await created.json();

  await page.goto(`/book/${id}`);

  await expect(
    page.getByRole("heading", { level: 2, name: "Консультация" }),
  ).toBeVisible();

  const dateStrip = page.getByRole("group", { name: "Даты записи" });
  await expect(dateStrip.getByRole("button")).toHaveCount(14);
  await expect(
    dateStrip.getByRole("button", {
      name: /понедельник, 16 ноября 2026/,
    }),
  ).toHaveAttribute("aria-pressed", "true");

  const firstSlot = page.getByRole("button", { name: /09:00–09:30/ });
  await expect(firstSlot).toBeVisible();
  await firstSlot.click();
  await expect(page.getByRole("status")).toContainText(
    "Выбран слот: 09:00–09:30",
  );
});

test("books a slot, shows confirmation, and removes it from availability", async ({
  page,
}) => {
  const id = await createMeetingType(page, "Бронирование E2E");

  await page.goto(`/book/${id}`);
  await page.getByRole("button", { name: /09:00–09:30/ }).click();
  await page.getByLabel("Имя").fill("Анна");
  await page.getByLabel("Email").fill("anna@example.com");
  await page
    .getByLabel("Комментарий (необязательно)")
    .fill("Обсудим архитектуру");
  await page.getByRole("button", { name: "Подтвердить запись" }).click();

  const confirmation = page.locator(".booking-confirmation");
  await expect(
    confirmation.getByRole("heading", { name: "Встреча забронирована" }),
  ).toBeVisible();
  await expect(confirmation).toContainText("Бронирование E2E");
  await expect(confirmation).toContainText("30 мин");
  await expect(confirmation).toContainText("09:00–09:30");
  await expect(confirmation).toContainText("Владелец");
  await expect(confirmation).toContainText("Анна");
  await expect(confirmation).toContainText("anna@example.com");
  await expect(confirmation).toContainText("Обсудим архитектуру");
  await expect(
    confirmation.getByText(
      "Письмо с подтверждением не отправляется — сохраните данные этой страницы.",
    ),
  ).toBeVisible();

  await page.goto(`/book/${id}`);
  await expect(page.getByRole("button", { name: /09:00–09:30/ })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: /09:30–10:00/ })).toBeVisible();
});

test("keeps contacts, clears the slot and refreshes availability after a conflict", async ({
  page,
}) => {
  const id = await createMeetingType(page, "Конфликт E2E");

  await page.goto(`/book/${id}`);
  await page
    .getByRole("group", { name: "Даты записи" })
    .getByRole("button", { name: /вторник, 17 ноября 2026/ })
    .click();
  await page.getByRole("button", { name: /17:00–17:30/ }).click();

  const reserved = await page.request.post("/api/bookings", {
    data: {
      meetingTypeId: id,
      start: CONFLICT_SLOT_START,
      guestName: "Другой гость",
      guestEmail: "other@example.com",
    },
  });
  expect(reserved.status()).toBe(201);

  await page.getByLabel("Имя").fill("Анна");
  await page.getByLabel("Email").fill("anna@example.com");
  await page.getByRole("button", { name: "Подтвердить запись" }).click();

  const alert = page.getByRole("alert");
  await expect(alert).toHaveText("Это время уже занято. Выберите другое.");
  await expect(alert).toBeFocused();
  await expect(page.getByLabel("Имя")).toHaveValue("Анна");
  await expect(page.getByLabel("Email")).toHaveValue("anna@example.com");
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /17:00–17:30/ })).toHaveCount(
    0,
  );
});
