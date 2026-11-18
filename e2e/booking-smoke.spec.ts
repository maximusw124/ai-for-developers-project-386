import { expect, test } from "@playwright/test";

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
