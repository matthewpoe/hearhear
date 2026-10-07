/**
 * Build the eval dataset from the hymn settings in sources/: the soprano line
 * becomes the melody, and the reference chords are read off all four voices
 * at each change point, so none is written from memory.
 *
 * A change point is the tune's first note or a downbeat where the melody
 * starts a note, whenever the setting's chord there differs from the last
 * change point's. Beats where the voices don't spell a chord (a passing or
 * suspended tone on the beat) are skipped.
 *
 * Run `node evals/dataset/derive.js` to rewrite songs/*.json.
 *
 * @import { Song } from "../../src/types.js"
 */

import { readFile, writeFile } from "node:fs/promises";
import { parseAbc } from "./abc.js";
import { chordOf, soundingAt } from "./sonority.js";

const here = new URL("./", import.meta.url);
const MELODY_VOICE = "S1V1";

/**
 * @typedef {{
 *   id: string, title: string, source: string, url: string, setting: string,
 *   key: { tonic: string, mode: "major" | "minor" }, bars: number, case: string
 * }} Tune
 */

/** @returns {Promise<Tune[]>} */
export async function loadTunes() {
  return JSON.parse(await readFile(new URL("tunes.json", here), "utf8"));
}

/**
 * @param {Tune} tune
 * @param {string} abcText the tune's source file
 * @returns {Song}
 */
export function deriveSong(tune, abcText) {
  const abc = parseAbc(abcText);
  const barTicks = (abc.beatsPerBar * 48) / abc.beatUnit;
  const pickupTicks = abc.barStarts[0] % barTicks;
  const end = pickupTicks + tune.bars * barTicks;

  const melody = abc.voices[MELODY_VOICE].filter((n) => n.start < end);
  const notes = melody.map((n, i) => ({
    id: `n${(i + 1).toString(36)}`,
    midi: n.midi,
    start: n.start,
    dur: Math.min(n.dur, end - n.start),
  }));

  const beatTicks = 48 / abc.beatUnit;
  const beats = Array.from({ length: end / beatTicks }, (_, k) => k * beatTicks);
  const ticks = [...new Set([notes[0].start, ...beats])].sort((a, b) => a - b);
  /** @type {Song["chords"]} */
  const chords = [];
  let last = "";
  for (const tick of ticks) {
    const note = notes.find((n) => n.start === tick);
    const chord = note && chordOf(soundingAt(abc.voices, tick));
    if (!note || !chord) continue;
    const name = `${chord.root}${chord.type}`;
    if (name === last) continue;
    last = name;
    chords.push({ id: `c${(chords.length + 1).toString(36)}`, noteId: note.id, ...chord });
  }

  return {
    schemaVersion: 1,
    id: tune.id,
    title: tune.title,
    key: { ...tune.key, provisional: false },
    meter: {
      beatsPerBar: abc.beatsPerBar,
      beatUnit: abc.beatUnit,
      pickupTicks,
      provisional: false,
    },
    tempo: abc.tempo,
    version: 1,
    notes,
    chords,
  };
}

/** @param {Tune} tune */
export async function deriveTune(tune) {
  return deriveSong(tune, await readFile(new URL(`sources/${tune.source}`, here), "utf8"));
}

if (import.meta.main) {
  for (const tune of await loadTunes()) {
    const song = await deriveTune(tune);
    await writeFile(new URL(`songs/${tune.id}.json`, here), `${JSON.stringify(song, null, 2)}\n`);
    const names = song.chords.map((c) => `${c.root}${c.type === "M" ? "" : c.type}`).join(" ");
    console.log(`${tune.id}: ${song.notes.length} notes; reference chords ${names}`);
  }
}
