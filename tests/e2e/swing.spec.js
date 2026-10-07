// A swung song shows a "Swing" marking above the staff; a straight one doesn't.

import { test, expect } from "@playwright/test";
import { axe } from "./axe.js";

test("St. James is marked Swing above the staff; Ode is not", async ({ page }) => {
  /** @type {string[]} */
  const problems = [];
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto("/");
  await page.getByRole("button", { name: "Beginner tips" }).click();
  const staff = page.locator("#staff");

  await page.getByRole("button", { name: /Ode to Joy/ }).click();
  await expect(staff.locator(".abcjs-notehead").first()).toBeVisible();
  await expect(staff.locator(".abcjs-tempo")).toHaveCount(0);

  await page.getByRole("combobox", { name: "Song" }).selectOption({ label: "St. James Infirmary" });
  const marking = staff.locator(".abcjs-tempo");
  await expect(marking).toHaveCount(1);
  await expect(marking).toContainText("Swing");
  const markBottom = await marking.evaluate((el) => el.getBoundingClientRect().bottom);
  const staffTop = await staff
    .locator(".abcjs-staff")
    .first()
    .evaluate((el) => el.getBoundingClientRect().top);
  expect(markBottom).toBeLessThanOrEqual(staffTop + 1);

  await axe(page);
  expect(problems).toEqual([]);
});
