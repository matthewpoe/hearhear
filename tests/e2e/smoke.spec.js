// The one UI test: it walks the golden path in CI with an axe check. In Phase 0
// the path is "the shell loads under the production CSP with every region";
// Phase 2 extends it to tune → key → chord audition → tutor exchange.

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("the app loads under the production CSP, with every region and no a11y violations", async ({
  page,
}) => {
  /** @type {string[]} */
  const problems = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") problems.push(msg.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Hear Hear", level: 1 })).toBeVisible();
  // The empty landing has no staff: nothing to play or print yet.
  for (const region of [
    "Welcome",
    "Chords",
    "Tutor",
    "How much should you trust the tutor?",
    "Keyboard",
  ]) {
    await expect(page.getByRole("region", { name: region, exact: true })).toBeVisible();
  }
  const staff = page.getByRole("region", { name: "Staff", exact: true });
  await expect(staff).toHaveCount(0);

  const axe = async () => {
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  };

  // Light by default.
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
  await axe();

  // Dark once chosen, and still dark after a reload.
  await page.getByRole("button", { name: "Dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await axe();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Dark mode" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // A tune brings the staff.
  await page.getByRole("button", { name: /Ode to Joy/ }).click();
  await expect(staff).toBeVisible();
  await axe();

  expect(problems).toEqual([]);
});
