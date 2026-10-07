/**
 * Pitches relative to a key: spelling, scale degrees, and the fixed octave
 * rows. A melody pitch's degree follows the key's convention for its pitch
 * class (CHROMATIC); a spelled name's degree (a chord root) follows its letter.
 *
 * @import { Key, ScaleDegree } from "../types.js"
 */

import { Interval, Note as TNote } from "tonal";

/** Semitones above the tonic for degrees 1–7. Minor is natural minor. */
export const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };

/** The same scales as interval names, for spelling by letter. */
export const DEGREE_INTERVALS = {
  major: ["1P", "2M", "3M", "4P", "5P", "6M", "7M"],
  minor: ["1P", "2M", "3m", "4P", "5P", "6m", "7m"],
};

/**
 * The PRD's conventional key names, indexed by pitch class: the spelling with
 * fewer accidentals in its key signature, and F# major and Eb minor on a tie.
 * The user picks the enharmonic twin (Gb, D#) by re-keying, or with
 * transposeSong's `prefer`.
 */
export const CONVENTIONAL_TONICS = {
  major: ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"],
  minor: ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"],
};

/**
 * How notes outside the scale are spelled, by semitones above the tonic, as
 * [preferred, fallback] intervals. Major uses the blues and borrowed flats
 * (b2, b3, b6, b7) and #4; minor uses b2, #4, and the raised 3rd, 6th, and
 * 7th (Shift+7 is the leading tone). The preferred interval names the degree,
 * and `midiToDegree` always reads it, so a label follows the number row's
 * modifier in every key. `spell` uses the fallback when the preferred name
 * needs a double accidental (G, not Abb, in Gb major). Minor's raised degrees
 * have no fallback: harmonic and melodic minor write them with a double sharp
 * (F## is G# minor's leading tone), so the staff does too.
 * @type {Record<"major" | "minor", Record<number, [string, string?]>>}
 */
const CHROMATIC = {
  major: { 1: ["2m", "1A"], 3: ["3m", "2A"], 6: ["4A", "5d"], 8: ["6m", "5A"], 10: ["7m", "6A"] },
  minor: { 1: ["2m", "1A"], 4: ["3M"], 6: ["4A"], 9: ["6M"], 11: ["7M"] },
};

const LETTERS = "CDEFGAB";

/** @param {number} n @param {number} m */
export const mod = (n, m) => ((n % m) + m) % m;

/** @param {string} name */
export const chromaOf = (name) => /** @type {number} */ (TNote.chroma(name));

/**
 * MIDI of degree 1 in the home octave (the number row): the tonic at or
 * above middle C, so the A row two octaves down never drops below C2.
 * @param {Key} key
 */
export function tonicMidi(key) {
  return 60 + chromaOf(key.tonic);
}

/**
 * Spell a pitch class in a key: the scale's own note when it is diatonic,
 * otherwise the conventional chromatic spelling (see CHROMATIC).
 * @param {number} chroma 0–11
 * @param {Key} key
 * @returns {string} e.g. "F#", "Bb"
 */
export function spellPitchClass(chroma, key) {
  const semis = mod(chroma - chromaOf(key.tonic), 12);
  const diatonic = SCALES[key.mode].indexOf(semis);
  if (diatonic >= 0) return TNote.transpose(key.tonic, DEGREE_INTERVALS[key.mode][diatonic]);
  const [preferred, fallback] = CHROMATIC[key.mode][semis];
  const name = TNote.transpose(key.tonic, preferred);
  return fallback && /##|bb/.test(name) ? TNote.transpose(key.tonic, fallback) : name;
}

/**
 * Scale degree of a spelled pitch class, by letter name: Bb in D major is b6,
 * A# would be #5. The accidental is how far it sits from the scale's note.
 * @param {string} pitchClass
 * @param {Key} key
 * @returns {{ degree: ScaleDegree["degree"], accidental: number }}
 */
export function degreeOf(pitchClass, key) {
  const steps = mod(LETTERS.indexOf(pitchClass[0]) - LETTERS.indexOf(key.tonic[0]), 7);
  const degree = /** @type {ScaleDegree["degree"]} */ (steps + 1);
  const diatonic = TNote.transpose(key.tonic, DEGREE_INTERVALS[key.mode][steps]);
  const accidental = mod(chromaOf(pitchClass) - chromaOf(diatonic) + 6, 12) - 6;
  return { degree, accidental };
}

/**
 * Spell a MIDI pitch in the context of a key, e.g. 66 in D major → "F#4",
 * 63 in C major → "Eb4", 75 in E minor → "D#5".
 * @param {number} midi
 * @param {Key} key
 * @returns {string}
 */
export function spell(midi, key) {
  // B# and Cb sit across the octave boundary from their MIDI octave.
  return withOctave(spellPitchClass(mod(midi, 12), key), midi);
}

/**
 * Spell a melody, note by note, in the context of a key and of its
 * neighbours. Diatonic notes spell as `spell` does. A chromatic note can be
 * named from the letter below (a sharp) or above (a flat); it takes whichever
 * name makes fewer augmented or diminished intervals with the notes before
 * and after it; on a tie, the name that leads cleanly into the next note, and
 * then today's `spell` name. Tritones don't count against a name: they
 * are augmented 4ths or diminished 5ths either way. So a chromatic note that
 * rises a half step is a sharp (G# to A, not Ab to A), one that falls a half
 * step is a flat (Ab to G), and the G# of an E7 bar in G major stays G# among
 * its E and B neighbours.
 *
 * One definition for the staff and the tutor snapshot. `spell(midi, key)`
 * stays context-free for single pitches (a piano key, a chord root).
 * @param {{ midi: number }[]} notes the melody, in order
 * @param {Key} key
 * @returns {string[]} one spelled pitch per note, e.g. "G#4"
 */
export function spellMelody(notes, key) {
  const plain = notes.map((note) => spell(note.midi, key));
  let spelled = plain;
  // A chromatic run's names depend on each other: each pass reads the next
  // note as the last pass spelled it, until nothing changes.
  for (let pass = 0; pass < 4; pass++) {
    const next = respell(notes, key, plain, spelled);
    if (next.every((name, i) => name === spelled[i])) break;
    spelled = next;
  }
  return spelled;
}

/**
 * One left-to-right pass of spellMelody.
 * @param {{ midi: number }[]} notes
 * @param {Key} key
 * @param {string[]} plain each note's context-free spelling
 * @param {string[]} last the previous pass, for the note after each one
 * @returns {string[]}
 */
function respell(notes, key, plain, last) {
  /** @type {string[]} */
  const out = [];
  notes.forEach((note, i) => {
    const semis = mod(note.midi - chromaOf(key.tonic), 12);
    // Diatonic notes, and naturals (E stays E, never Fb), keep spell's name.
    if (SCALES[key.mode].includes(semis) || !/[#b]/.test(plain[i])) {
      out.push(plain[i]);
      return;
    }
    const before = out[i - 1];
    const after = last[i + 1];
    /** @param {string} name @param {string | undefined} other */
    const clash = (name, other) => (other && isAugmentedOrDiminished(name, other) ? 1 : 0);
    // Fewest clashes; on a tie, the one that leads cleanly into the next note.
    /** @param {string} name */
    const cost = (name) => 2 * (clash(name, before) + clash(name, after)) + clash(name, after);
    const best = [plain[i], ...enharmonics(note.midi).filter((name) => /[#b]/.test(name))]
      .filter((name, at, all) => all.indexOf(name) === at)
      .reduce((a, b) => (cost(b) < cost(a) ? b : a));
    out.push(best);
  });
  return out;
}

/**
 * A melody note's degree as `spellMelody` spelled it: by the key's
 * convention (midiToDegree) when the spelling is `spell`'s, and by its letter
 * when context chose the other name, so G# in G major reads #1, not b2.
 * @param {number} midi
 * @param {string} spelled from spellMelody, e.g. "G#4"
 * @param {Key} key
 * @returns {ScaleDegree}
 */
export function melodyDegree(midi, spelled, key) {
  const conventional = midiToDegree(midi, key);
  if (spelled === spell(midi, key)) return conventional;
  const { degree, accidental } = degreeOf(spelled.replace(/-?\d+$/, ""), key);
  return {
    ...conventional,
    degree,
    accidental: /** @type {ScaleDegree["accidental"]} */ (accidental),
  };
}

/**
 * The sharp and flat names of a MIDI pitch, with octave: from the letter
 * below (raised) and the letter above (lowered). A natural pitch has its own
 * name among them.
 * @param {number} midi
 * @returns {string[]}
 */
function enharmonics(midi) {
  const names = [];
  for (const letter of LETTERS) {
    const accidental = mod(midi - chromaOf(letter) + 6, 12) - 6;
    if (Math.abs(accidental) > 1) continue;
    const pitchClass = letter + (accidental === 1 ? "#" : accidental === -1 ? "b" : "");
    names.push(withOctave(pitchClass, midi));
  }
  return names;
}

/**
 * Whether the interval between two spelled pitches is augmented or
 * diminished, not counting the tritone.
 * @param {string} a
 * @param {string} b
 */
function isAugmentedOrDiminished(a, b) {
  const interval = Interval.get(Interval.distance(a, b));
  const quality = interval.q ?? "";
  if (!/^(A+|d+)$/.test(quality)) return false;
  const simple = Math.abs(Number(interval.simple));
  const tritone = (simple === 4 && quality === "A") || (simple === 5 && quality === "d");
  return !tritone;
}

/**
 * A pitch class with the octave that makes it sound at `midi` (B#3 is C4).
 * @param {string} pitchClass
 * @param {number} midi
 */
function withOctave(pitchClass, midi) {
  let octave = Math.floor(midi / 12) - 1;
  const at = (/** @type {number} */ o) => /** @type {number} */ (TNote.midi(pitchClass + o));
  if (at(octave) > midi) octave--;
  if (at(octave) < midi) octave++;
  return pitchClass + octave;
}

/**
 * Resolve a scale degree to an absolute pitch. Minor keys use natural minor.
 * @param {ScaleDegree} degree
 * @param {Key} key
 * @param {number} [windowOctave=0] The arrow keys' octave shift of the whole input window.
 * @returns {number} MIDI
 */
export function degreeToMidi({ degree, accidental, octave }, key, windowOctave = 0) {
  const step = SCALES[key.mode][degree - 1];
  return tonicMidi(key) + step + accidental + 12 * (octave + windowOctave);
}

/**
 * The inverse of degreeToMidi: which degree (and octave dot) a pitch is in a
 * key, by the key's convention for its pitch class (CHROMATIC), so 63 in
 * C major is b3, not #2. Every conventional Shift or Alt keystroke reads back
 * as itself in every key, even where `spell` avoids a double accidental
 * (Alt+3 in Gb major is b3, spelled A).
 * @param {number} midi
 * @param {Key} key
 * @returns {ScaleDegree}
 */
export function midiToDegree(midi, key) {
  const semis = mod(midi - tonicMidi(key), 12);
  const diatonic = SCALES[key.mode].indexOf(semis);
  const index =
    diatonic >= 0 ? diatonic : Number(Interval.get(CHROMATIC[key.mode][semis][0]).num) - 1;
  const step = SCALES[key.mode][index];
  // Within ±1 by construction: the preferred interval is one semitone off the scale.
  const accidental = /** @type {ScaleDegree["accidental"]} */ (mod(semis - step + 6, 12) - 6);
  return {
    degree: /** @type {ScaleDegree["degree"]} */ (index + 1),
    accidental,
    octave: Math.round((midi - accidental - tonicMidi(key) - step) / 12),
  };
}
