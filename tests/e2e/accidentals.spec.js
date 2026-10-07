// The accidental menu on staff notes: a right-click offers the note's letter
// with each accidental, a choice changes the pitch (and Undo brings it back),
// the keyboard reaches it with Shift+F10, and it passes axe in both themes.
// Fails on any console error.

import { test, expect } from "@playwright/test";
import { axe } from "./axe.js";

/** Ode to Joy's third note: G4, in D major once the key is chosen. */
const G = "n3";

/**
 * A note's head, aimed above its middle (a head on a line has the staff line
 * across its middle).
 * @param {import("@playwright/test").Page} page
 * @param {string} id
 */
async function noteHead(page, id) {
  const head = page.locator(`#staff [role="button"][data-note-id="${id}"] .abcjs-notehead`);
  const box = await head.boundingBox();
  if (!box) throw new Error(`note ${id} isn't on the staff`);
  return { head, position: { x: box.width / 2, y: box.height / 4 } };
}

test("right-click a note to change its accidental, by mouse and keyboard", async ({ page }) => {
  /** @type {string[]} */
  const problems = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") problems.push(msg.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto("/");
  await page.getByRole("button", { name: "Beginner tips" }).click();
  await page.getByRole("button", { name: /Ode to Joy/ }).click();
  // Home is D, so G4 is a plain G and G sharp is written as one.
  await page
    .locator("#key-prompt")
    .getByRole("group", { name: "Home note" })
    .getByRole("button", { name: "D", exact: true })
    .click();

  const note = page.locator(`#staff [role="button"][data-note-id="${G}"]`);
  await expect(note).toHaveAccessibleName(/^G 4\b/);
  // The tooltip says how to reach both menus.
  await expect(note.locator("> title")).toHaveText(
    "Click for chords · right-click to change the accidental",
  );

  /** The menu sits just below or just above the note, never over it. */
  const besideNote = async () => {
    const noteBox = await note.boundingBox();
    const menuBox = await page.locator(".accidentals").boundingBox();
    if (!noteBox || !menuBox) throw new Error("note or menu has no box");
    const below = menuBox.y - (noteBox.y + noteBox.height);
    const above = noteBox.y - (menuBox.y + menuBox.height);
    expect(below >= 0 || above >= 0, "the menu overlaps its note").toBe(true);
    expect(Math.min(Math.abs(below), Math.abs(above))).toBeLessThan(16);
  };
  /** Wheel-scroll the page 60px, up if it can go up, else down. */
  const scrollAway = async () => {
    const before = await page.evaluate(() => window.scrollY);
    const dy = before >= 60 ? -60 : 60;
    // Wheel over the page's corner, away from the menu (which keeps its own scroll).
    await page.mouse.move(4, 4);
    await page.mouse.wheel(0, dy);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(before + dy);
  };

  // 1. Right-click: the menu lists G with each accidental, natural checked.
  // It stays beside the note as the page scrolls (it once drifted by the
  // scroll distance, onto the note).
  const { head, position } = await noteHead(page, G);
  await head.click({ button: "right", position });
  const menu = page.getByRole("menu", { name: "Change G4" });
  await expect(menu).toBeVisible();
  await expect(menu).toBeInViewport();
  await besideNote();
  await scrollAway();
  await expect(menu).toBeVisible();
  await besideNote();
  const items = menu.getByRole("menuitemradio");
  await expect(items).toHaveText(["G♯", /^G♭\s*Shows as F♯ in this key$/, "G♮", /^G𝄪/, /^G𝄫/]);
  await expect(menu.getByRole("menuitemradio", { checked: true })).toHaveAccessibleName(
    "G natural",
  );
  await expect(menu.getByRole("menuitemradio", { name: "G natural" })).toBeFocused();
  // The chord dropdown stays shut: right-click is not a click.
  await expect(page.locator("#chords [role='dialog']")).toHaveCount(0);
  await axe(page);
  // The theme toggle is outside the menu, so pressing it closes the menu.
  const darkMode = page.getByRole("button", { name: "Dark mode" });
  await darkMode.click();
  await expect(menu).toHaveCount(0);
  await head.click({ button: "right", position });
  await expect(menu).toBeVisible();
  await axe(page);
  await darkMode.click();
  await head.click({ button: "right", position });

  // 2. Choose sharp: the staff writes G sharp, the change is announced, and
  // focus is back on the note.
  await menu.getByRole("menuitemradio", { name: "G sharp" }).click();
  await expect(menu).toHaveCount(0);
  await expect(note).toHaveAccessibleName(/^G sharp 4\b/);
  await expect(page.locator("#staff .pitch-status")).toHaveText("G sharp 4");
  await expect(note).toBeFocused();

  // 3. Undo restores the natural.
  await page.getByRole("group", { name: "History" }).getByRole("button", { name: "Undo" }).click();
  await expect(note).toHaveAccessibleName(/^G 4\b/);

  // 4. The keyboard: Shift+F10 on the focused note, arrows, Enter.
  await note.focus();
  await page.keyboard.press("Shift+F10");
  await expect(menu.getByRole("menuitemradio", { name: "G natural" })).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(menu.getByRole("menuitemradio", { name: /^G flat/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveCount(0);
  await expect(note).toBeFocused();
  // G flat in D major is the F sharp that's already in the key.
  await expect(note).toHaveAccessibleName(/^F sharp 4\b/);
  await expect(page.locator("#staff .pitch-status")).toHaveText("G flat 4, shown as F sharp 4");

  // 5. Escape closes without a change and returns focus; the ContextMenu key opens it too.
  await page.keyboard.press("ContextMenu");
  await expect(page.getByRole("menu", { name: "Change F♯4" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(note).toBeFocused();
  await expect(note).toHaveAccessibleName(/^F sharp 4\b/);

  expect(problems).toEqual([]);
});
