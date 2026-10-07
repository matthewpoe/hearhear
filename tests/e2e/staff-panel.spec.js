// The dark theme's staff panel: a "Staff: Slate / Paper" control beside the
// Dark mode toggle, slate by default, remembered across a reload, and absent
// in the light theme, where the staff draws straight on the page. Themes are
// switched with the app's own toggle. Passes axe on both panels, and the
// rings drawn around a notehead (the lesson's spotlight, the hover glow) stand
// out from either panel at 3:1 or better (WCAG non-text).

import { test, expect } from "@playwright/test";
import { axe } from "./axe.js";

const SLATE = "rgb(43, 33, 53)";
const PAPER = "rgb(233, 225, 207)";
const NONE = "rgba(0, 0, 0, 0)";

/**
 * WCAG contrast ratio between two computed "rgb(r, g, b)" colors.
 * @param {string} a
 * @param {string} b
 */
function contrast(a, b) {
  /** @param {string} color */
  const luminance = (color) => {
    const [r, g, b] = (color.match(/[\d.]+/g) ?? []).slice(0, 3).map((c) => {
      const s = Number(c) / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The stroke a notehead takes when its note wears `className` (the lesson's
 * "spotlight", or "is-hovered"), set by hand on the first note as the staff's
 * own highlight() does.
 * @param {import("@playwright/test").Page} page
 * @param {string} className
 */
function ringStroke(page, className) {
  return page.evaluate((name) => {
    const note = document.querySelector('#staff [role="button"][data-note-id]');
    const head = note?.querySelector(".abcjs-notehead");
    if (!note || !head) throw new Error("no note on the staff");
    note.classList.add(name);
    const stroke = getComputedStyle(head).stroke;
    note.classList.remove(name);
    return stroke;
  }, className);
}

test("dark mode offers a slate or paper staff, and light mode doesn't", async ({ page }) => {
  /** @type {string[]} */
  const problems = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") problems.push(msg.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto("/");
  await page.getByRole("button", { name: "Leave lesson" }).click();
  // A tune with degrees and a function-colored chord on it, so axe sees them.
  await page.getByRole("button", { name: /Ode to Joy/ }).click();
  await page
    .locator("#key-prompt")
    .getByRole("group", { name: "Home note" })
    .getByRole("button", { name: "D", exact: true })
    .click();
  await expect(page.locator("#staff text.abcjs-lyric").first()).toBeVisible();

  const frame = page.locator("#staff .frame");
  const background = () => frame.evaluate((el) => getComputedStyle(el).backgroundColor);
  const control = page.getByRole("group", { name: "Staff", exact: true });
  const slate = control.getByRole("radio", { name: "Slate" });
  const paper = control.getByRole("radio", { name: "Paper" });
  const darkMode = page.getByRole("button", { name: "Dark mode" });
  /** Both rings clear 3:1 against the panel. */
  const ringsStandOut = async () => {
    const panel = await background();
    for (const name of ["spotlight", "is-hovered"]) {
      const stroke = await ringStroke(page, name);
      expect(stroke, `${name} ring`).not.toBe(panel);
      expect(contrast(stroke, panel), `${name} ring ${stroke} on ${panel}`).toBeGreaterThanOrEqual(
        3,
      );
    }
  };

  // Light: no control, no panel.
  await expect(control).toHaveCount(0);
  expect(await background()).toBe(NONE);

  // Dark: the control appears beside the toggle, on slate.
  await darkMode.click();
  await expect(control).toBeVisible();
  await expect(slate).toBeChecked();
  await expect.poll(background).toBe(SLATE);
  await ringsStandOut();
  await axe(page);

  // Paper. The radios are visually hidden in their labels: click as a viewer does.
  await control.locator("label").filter({ hasText: "Paper" }).click();
  await expect(paper).toBeChecked();
  await expect.poll(background).toBe(PAPER);
  await ringsStandOut();
  await axe(page);

  // Remembered across a reload, applied before the app mounts.
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-staff-panel", "paper");
  await expect(paper).toBeChecked();
  await expect.poll(background).toBe(PAPER);

  // Back to slate.
  await control.locator("label").filter({ hasText: "Slate" }).click();
  await expect(slate).toBeChecked();
  await expect.poll(background).toBe(SLATE);

  // Light again: the control goes away and the staff is back on the page.
  await darkMode.click();
  await expect(control).toHaveCount(0);
  await expect.poll(background).toBe(NONE);
  await axe(page);

  expect(problems).toEqual([]);
});
