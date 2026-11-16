import { expect, test } from "@playwright/test";

test("loads /book against the real backend and shows the empty state", async ({
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
});
