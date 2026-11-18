import { expect, test } from "@playwright/test";

const MEETING_TYPE = "Сквозная встреча";
const GUEST_NAME = "Мария";
const GUEST_EMAIL = "maria@example.com";

test("owner creates a meeting type, guest books it, owner sees the booking", async ({
  page,
}) => {
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { level: 1, name: "Админка" }),
  ).toBeVisible();

  const types = page.getByRole("region", { name: "Типы встреч" });
  await types.getByLabel("Название").fill(MEETING_TYPE);
  await types.getByLabel("Описание").fill("Разбор задачи вместе с владельцем");
  await types.getByLabel("Длительность (мин)").fill("30");
  await types.getByRole("button", { name: "Сохранить" }).click();

  const createdType = types.locator(".admin-type-item").filter({
    hasText: MEETING_TYPE,
  });
  await expect(createdType).toBeVisible();

  await page.goto("/book");
  await expect(
    page.getByRole("heading", { level: 1, name: "Запись на встречу" }),
  ).toBeVisible();
  await page.getByRole("link", { name: MEETING_TYPE }).click();

  await expect(
    page.getByRole("heading", { level: 2, name: MEETING_TYPE }),
  ).toBeVisible();
  await expect(
    page.getByText("Все время указано по Москве (Europe/Moscow)."),
  ).toBeVisible();

  const dates = page.getByRole("group", { name: "Даты записи" });
  await expect(dates.getByRole("button")).toHaveCount(14);
  await dates
    .getByRole("button", { name: /понедельник, 16 ноября 2026/ })
    .click();
  await page.getByRole("button", { name: /10:00–10:30/ }).click();
  await expect(page.getByRole("status")).toContainText(
    "Выбран слот: 10:00–10:30",
  );

  await page.getByLabel("Имя").fill(GUEST_NAME);
  await page.getByLabel("Email").fill(GUEST_EMAIL);
  await page
    .getByLabel("Комментарий (необязательно)")
    .fill("Обсудим архитектуру");
  await page.getByRole("button", { name: "Подтвердить запись" }).click();

  const confirmation = page.locator(".booking-confirmation");
  await expect(
    confirmation.getByRole("heading", { name: "Встреча забронирована" }),
  ).toBeVisible();
  await expect(confirmation).toContainText(MEETING_TYPE);
  await expect(confirmation).toContainText("30 мин");
  await expect(confirmation).toContainText("Время по Москве");
  await expect(confirmation).toContainText("10:00–10:30");
  await expect(confirmation).toContainText("Владелец");
  await expect(confirmation).toContainText(GUEST_NAME);
  await expect(confirmation).toContainText(GUEST_EMAIL);
  await expect(
    confirmation.getByText(
      "Письмо с подтверждением не отправляется — сохраните данные этой страницы.",
    ),
  ).toBeVisible();

  await page.goto("/admin");
  const upcoming = page.getByRole("region", { name: "Предстоящие встречи" });
  await expect(upcoming.getByText("Время по Москве")).toBeVisible();
  await upcoming.getByRole("button", { name: "Обновить" }).click();

  const booking = upcoming.locator(".booking-card").filter({
    hasText: MEETING_TYPE,
  });
  await expect(booking).toBeVisible();
  await expect(booking).toContainText("10:00–10:30");
  await expect(booking).toContainText(GUEST_NAME);
  await expect(booking).toContainText("Обсудим архитектуру");
  await expect(
    booking.getByRole("link", { name: GUEST_EMAIL }),
  ).toHaveAttribute("href", `mailto:${GUEST_EMAIL}`);
});
