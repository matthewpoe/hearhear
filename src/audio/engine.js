/**
 * The sound engine: Tone.js, its one AudioContext, and the instruments. Tone
 * is imported on first use, so it stays out of the first-paint bundle.
 *
 * Instruments are samplers and plain synths only. Nothing here uses an
 * AudioWorklet, which Tone loads from a blob: URL that the CSP's script-src
 * blocks. Tone's clock runs in a blob: Worker, which worker-src allows.
 *
 * @typedef {import("./index.js").AudioStatus} AudioStatus
 * @typedef {typeof import("tone")} ToneModule
 * @typedef {{ live: import("tone").Sampler, phrase: import("tone").Sampler }} Pianos
 * @typedef {{
 *   Tone: ToneModule,
 *   drone: import("tone").PolySynth,
 *   click: import("tone").Synth,
 *   pianos: Pianos | null,
 * }} Engine
 */

import { createReadable } from "../lib/readable.js";

const SAMPLE_BASE_URL = "/samples/piano/";
const LOWEST_SAMPLE = 36; // C2
const HIGHEST_SAMPLE = 84; // C6
const SAMPLE_STEP = 3; // a minor third; Tone.Sampler fills the gaps
const SAMPLE_NAMES = ["C", "Ds", "Fs", "A"];

/**
 * Scheduled playback (Transport, Draw) runs this far ahead of the audio clock
 * so it never glitches. Live notes skip it entirely (see `immediate`), so this
 * only delays the start of a phrase, not a key press.
 */
const TRANSPORT_LOOK_AHEAD = 0.05;

/**
 * How long wake() waits for the context to resume. Chrome leaves resume()
 * pending, not rejected, without a user gesture, so waiting longer would hang.
 */
const RESUME_TIMEOUT_MS = 1000;

/** Sample loading state; `failed` clears on the next `loadSamples`. */
export const status = createReadable(/** @type {AudioStatus} */ ("idle"));

/** @type {Engine | null} */
let engine = null;
/** @type {Promise<Engine> | null} */
let loadingTone = null;
/** @type {Promise<void> | null} */
let loadingSamples = null;

/** @param {number} midi */
export const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

/** The loaded engine, or null before the first `loadEngine` resolves. */
export const current = () => engine;

/** Sample URLs keyed by MIDI number, e.g. 39 → "Ds2.mp3". */
function sampleUrls() {
  /** @type {Record<number, string>} */
  const urls = {};
  for (let midi = LOWEST_SAMPLE; midi <= HIGHEST_SAMPLE; midi += SAMPLE_STEP) {
    const name = SAMPLE_NAMES[((midi - LOWEST_SAMPLE) / SAMPLE_STEP) % SAMPLE_NAMES.length];
    urls[midi] = `${name}${Math.floor(midi / 12) - 1}.mp3`;
  }
  return urls;
}

/**
 * Import Tone and build the synths. Tone's default context is the app's one
 * AudioContext; it is created with latencyHint "interactive".
 * @returns {Promise<Engine>}
 */
export function loadEngine() {
  loadingTone ??= import("tone").then(
    (Tone) => {
      Tone.getContext().lookAhead = TRANSPORT_LOOK_AHEAD;
      // A soft pad for the key finder's held chord: a slow swell and a long
      // release, quiet enough per voice that three of them sit under the
      // piano melody rather than on top of it.
      const drone = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "triangle" },
        envelope: { attack: 0.6, decay: 0.3, sustain: 0.85, release: 1.5 },
        volume: -22,
      }).toDestination();
      const click = new Tone.Synth({
        oscillator: { type: "square" },
        envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.02 },
        volume: -16,
      }).toDestination();
      engine = { Tone, drone, click, pianos: null };
      return engine;
    },
    (error) => {
      loadingTone = null;
      status.set("failed");
      throw error;
    },
  );
  return loadingTone;
}

/**
 * @param {ToneModule} Tone
 * @returns {Promise<import("tone").ToneAudioBuffers>}
 */
function fetchSamples(Tone) {
  return new Promise((resolve, reject) => {
    const buffers = new Tone.ToneAudioBuffers({
      urls: sampleUrls(),
      baseUrl: SAMPLE_BASE_URL,
      onload: () => resolve(buffers),
      onerror: reject,
    });
  });
}

/**
 * Fetch and decode the piano samples once; safe to call again, and calling it
 * after a failure is the retry. Resolves either way: `status` says which.
 * @returns {Promise<void>}
 */
export function loadSamples() {
  if (loadingSamples) return loadingSamples;
  status.set("loading");
  loadingSamples = loadEngine()
    .then((loaded) => fetchSamples(loaded.Tone).then((buffers) => ({ loaded, buffers })))
    .then(
      ({ loaded, buffers }) => {
        const { Tone } = loaded;
        /** @type {Record<number, import("tone").ToneAudioBuffer>} */
        const urls = {};
        for (const midi of Object.keys(sampleUrls())) urls[Number(midi)] = buffers.get(midi);
        // Two samplers on the same buffers, so stopping playback never cuts
        // a key the user is holding.
        const sampler = () => new Tone.Sampler({ urls, release: 1 }).toDestination();
        loaded.pianos = { live: sampler(), phrase: sampler() };
        status.set("ready");
      },
      (error) => {
        console.error("Piano samples failed to load", error);
        loadingSamples = null;
        status.set("failed");
      },
    );
  return loadingSamples;
}

/**
 * Everything needed to make sound: Tone, a running context, and the samples.
 * Starting the context needs a user gesture somewhere before this call.
 * Resolves to null if Tone failed to load or the context is still suspended
 * (no gesture yet), and to an engine with `pianos: null` if the samples
 * failed. After a failed sample load it does not refetch: preload() is the
 * one retry, so an offline user's key presses don't each fire 17 requests.
 * @returns {Promise<Engine | null>}
 */
export async function wake() {
  /** @type {Engine} */
  let loaded;
  try {
    loaded = await loadEngine();
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(resolve, RESUME_TIMEOUT_MS);
    });
    await Promise.race([loaded.Tone.start(), timeout]).finally(() => clearTimeout(timer));
  } catch (error) {
    console.error("Audio failed to start", error);
    status.set("failed");
    return null;
  }
  if (loaded.Tone.getContext().state !== "running") {
    console.error("Audio is suspended: call unlock() from a user gesture first");
    return null;
  }
  if (status.get() !== "failed") await loadSamples();
  return loaded;
}
