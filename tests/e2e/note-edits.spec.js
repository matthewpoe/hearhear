// Editing notes: the numeric keypad plays as the number row, a recorded
// tune renames from its title on the staff, and the note menu (right-click
// or Shift+F10) moves a note by half steps and octaves, makes it longer or
// shorter, and deletes it, leaving a rest. Shift+Backspace deletes the
// focused note. Fails on any console error and any axe violation.

import { test, expect } from "@playwright/test";
import { axe } from "./axe.js";

/** Ode to Joy's third note: G4, in D major once the key is chosen. */
const G = "n3";

/** @param {import("@playwright/test").Page} page */
function watchConsole(page) {
  /** @type {string[]} */
  const problems = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") problems.push(msg.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));
  return problems;
}

/** @param {import("@playwright/test").Page} page */
async function openOde(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Leave lesson" }).click();
  await page.getByRole("button", { name: /Ode to Joy/ }).click();
  await page
    .locator("#key-prompt")
    .getByRole("group", { name: "Home note" })
    .getByRole("button", { name: "D", exact: true })
    .click();
}

/** @param {import("@playwright/test").Page} page */
const staffNotes = (page) => page.locator('#staff [role="button"][data-note-id]');

test("the numeric keypad plays the number row's notes", async ({ page }) => {
  const problems = watchConsole(page);
  await openOde(page);
  const held = page.locator("#piano .key.held");
  for (const [digit, pad] of [
    ["Digit1", "Numpad1"],
    ["Digit5", "Numpad5"],
    ["Digit0", "Numpad0"],
  ]) {
    await page.keyboard.down(digit);
    await expect(held).toHaveCount(1);
    const name = await held.getAttribute("aria-label");
    await page.keyboard.up(digit);
    await expect(held).toHaveCount(0);
    await page.keyboard.down(pad);
    await expect(held).toHaveCount(1);
    await expect(held).toHaveAttribute("aria-label", name ?? "");
    await page.keyboard.up(pad);
    await expect(held).toHaveCount(0);
  }
  expect(problems).toEqual([]);
});

test("a recorded tune renames from its title on the staff; a demo's title doesn't", async ({
  page,
}) => {
  const problems = watchConsole(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Leave lesson" }).click();
  await page.getByRole("button", { name: /^Record a tune/ }).click();
  for (const key of ["Digit1", "Digit2", "Digit3"]) {
    await page.keyboard.down(key);
    await page.waitForTimeout(100);
    await page.keyboard.up(key);
    await page.waitForTimeout(400);
  }
  await page.keyboard.press("Escape");
  const bar = page.getByRole("region", { name: "Your tune" });
  const field = bar.getByLabel("Name your tune");
  await expect(field).toBeFocused();
  await field.press("Enter");
  const svg = page.locator("#staff svg");
  await expect(svg).toHaveAttribute("aria-label", "Notation: My tune 1");

  // Click the title drawn on the staff: the same field opens, focused.
  const heading = page.locator("#staff .abcjs-title");
  await expect(heading).toHaveClass(/renamable/);
  await heading.click();
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("My tune 1");
  await field.fill("Kitchen tune");
  await field.press("Enter");
  await expect(svg).toHaveAttribute("aria-label", "Notation: Kitchen tune");
  await expect(bar.getByRole("button", { name: "Rename Kitchen tune" })).toBeFocused();

  // Escape cancels.
  await page.locator("#staff .abcjs-title").click();
  await field.fill("Not this");
  await field.press("Escape");
  await expect(field).toHaveCount(0);
  await expect(svg).toHaveAttribute("aria-label", "Notation: Kitchen tune");

  // A demo's title is plain text.
  await page.getByRole("combobox", { name: "Song" }).selectOption({ label: "Ode to Joy" });
  await expect(svg).toHaveAttribute("aria-label", "Notation: Ode to Joy");
  await expect(page.locator("#staff .abcjs-title")).not.toHaveClass(/renamable/);
  await page.locator("#staff .abcjs-title").click();
  await expect(page.getByLabel("Name your tune")).toHaveCount(0);
  expect(problems).toEqual([]);
});

test("the note menu moves, lengthens, shortens and deletes a note", async ({ page }) => {
  const problems = watchConsole(page);
  await openOde(page);
  const note = page.locator(`#staff [role="button"][data-note-id="${G}"]`);
  const status = page.locator("#staff .pitch-status");
  const count = await staffNotes(page).count();
  await expect(note).toHaveAccessibleName(/^G 4\b/);

  // 1. Open from the keyboard; the menu stays above the keyboard dock.
  await note.focus();
  await page.keyboard.press("Shift+F10");
  const menu = page.getByRole("menu", { name: /^Change / });
  await expect(menu).toBeVisible();
  const menuBox = await page.locator(".accidentals").boundingBox();
  const dockBox = await page.locator(".keyboard-dock").boundingBox();
  if (!menuBox || !dockBox) throw new Error("menu or dock has no box");
  expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(dockBox.y);
  await axe(page);

  // 2. Half steps repeat: the menu stays open, and each is announced.
  const up = menu.getByRole("menuitem", { name: "Up a half step" });
  await up.click();
  await expect(menu).toBeVisible();
  await expect(note).toHaveAccessibleName(/^G sharp 4\b/);
  await expect(status).toHaveText("G sharp 4");
  await up.click();
  await expect(note).toHaveAccessibleName(/^A 4\b/);
  await expect(up).toBeFocused();
  // Shift+Down from inside the menu steps down; plain arrows still move focus.
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+ArrowDown");
  await expect(note).toHaveAccessibleName(/^G 4\b/);
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Down a half step" })).toBeFocused();

  // 3. Octaves.
  await menu.getByRole("menuitem", { name: "Up an octave" }).click();
  await expect(note).toHaveAccessibleName(/^G 5\b/);
  await menu.getByRole("menuitem", { name: "Down an octave" }).click();
  await expect(note).toHaveAccessibleName(/^G 4\b/);

  // 4. Length: an eighth at a time, never under an eighth.
  const longer = menu.getByRole("menuitem", { name: /^Longer/ });
  const shorter = menu.getByRole("menuitem", { name: /^Shorter/ });
  await longer.click();
  await expect(status).toHaveText("G4, a dotted quarter note");
  await shorter.click();
  await shorter.click();
  await expect(status).toHaveText("G4, an eighth note");
  await expect(shorter).toHaveAttribute("aria-disabled", "true");
  await shorter.click({ force: true }); // disabled: nothing changes
  await expect(status).toHaveText("G4, an eighth note");
  await longer.click();
  await expect(shorter).toHaveAttribute("aria-disabled", "false");

  // 5. Delete note: one fewer note, its time a rest, focus on the next note.
  await menu.getByRole("menuitem", { name: /^Delete note/ }).click();
  await expect(menu).toHaveCount(0);
  await expect(staffNotes(page)).toHaveCount(count - 1);
  await expect(note).toHaveCount(0);
  await expect(status).toHaveText("Deleted G4. Its time is a rest.");
  await expect(page.locator('#staff [role="button"][data-note-id="n4"]')).toBeFocused();
  // One Undo brings it back.
  const undo = page.getByRole("group", { name: "History" }).getByRole("button", { name: "Undo" });
  await undo.click();
  await expect(staffNotes(page)).toHaveCount(count);

  // 6. Shift+Backspace on the focused note deletes it too; plain Backspace doesn't.
  await note.focus();
  await page.keyboard.press("Backspace");
  await expect(staffNotes(page)).toHaveCount(count);
  await page.keyboard.press("Shift+Backspace");
  await expect(staffNotes(page)).toHaveCount(count - 1);
  await expect(status).toHaveText("Deleted G4. Its time is a rest.");

  // 7. Dark theme.
  await page.locator('#staff [role="button"][data-note-id="n4"]').focus();
  await page.keyboard.press("Shift+F10");
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Dark mode" }).click();
  await page.locator('#staff [role="button"][data-note-id="n4"]').focus();
  await page.keyboard.press("Shift+F10");
  await expect(menu).toBeVisible();
  await axe(page);
  expect(problems).toEqual([]);
});
