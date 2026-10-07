/**
 * Note and key names as the app shows them. Theory spells accidentals in
 * ASCII ("Db", "F#m7"); the screen shows music symbols ("D♭", "F♯m7"), and an
 * accessible name spells them out ("D flat", "F sharp m7"), since screen
 * readers don't reliably say ♭ and ♯.
 *
 * Only an accidental right after a note letter (A to G, not inside a word)
 * changes, so a Roman numeral's or Nashville number's leading "b" ("bVII",
 * "b7") stays as theory writes it, and so does "m7b5".
 */

const ACCIDENTAL = /(?<![A-Za-z])([A-G])(##|#|bb|b|𝄪|♯|𝄫|♭)/gu;

/** @type {Record<string, string>} */
const GLYPHS = { "##": "𝄪", "#": "♯", bb: "𝄫", b: "♭" };
/** @type {Record<string, string>} */
const WORDS = { "##": "double sharp", "#": "sharp", bb: "double flat", b: "flat" };
for (const [ascii, glyph] of Object.entries(GLYPHS)) {
  GLYPHS[glyph] = glyph;
  WORDS[glyph] = WORDS[ascii];
}

/**
 * "Db major" → "D♭ major", "F#m" → "F♯m".
 * @param {string} name
 */
export function displayNote(name) {
  return name.replace(ACCIDENTAL, (_, letter, acc) => letter + GLYPHS[acc]);
}

/**
 * "Db major" or "D♭ major" → "D flat major", "F#m" → "F sharp m".
 * @param {string} name
 */
export function spokenNote(name) {
  return name.replace(ACCIDENTAL, (match, letter, acc, at, whole) => {
    const word = `${letter} ${WORDS[acc]}`;
    const next = whole[at + match.length];
    return next && next !== " " ? `${word} ` : word;
  });
}
