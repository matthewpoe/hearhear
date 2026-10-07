import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { capture } from "../../scripts/capture-lessons.js";

const script = new URL("../../scripts/capture-lessons.js", import.meta.url);

const PLAN = {
  exchanges: [
    {
      id: "bar4",
      label: "Bar 4",
      song: "ode-to-joy",
      key: "committed",
      chords: [{ bar: 1, beat: 1, numeral: "I" }],
      hint_level: "comparison",
      question: "What chord could go under bar 4, beat 3?",
    },
    {
      id: "bar4-follow-up",
      follows: "bar4",
      song: "ode-to-joy",
      key: "committed",
      chords: [],
      hint_level: "answer",
      question: "Which one would you pick?",
    },
  ],
};

const SUGGESTION = {
  bar: 4,
  beat: 3,
  numeral: "V",
  letter: "A",
  confidence: "medium",
  reason: "The held E is the 5th of A.",
};

/** @param {{ fallback?: boolean, error?: boolean }} [reply] */
const replyEvents = ({ fallback = false, error = false } = {}) => [
  ["message", { delta: "Try two chords " }],
  ["message", { delta: "under the long E." }],
  error
    ? ["error", { code: "upstream", message: "The tutor couldn't be reached." }]
    : [
        "suggestions",
        {
          hint_level: "comparison",
          suggestions: [SUGGESTION],
          snapshot_version: 4,
          dropped: 0,
          served_by: fallback ? "claude-fallback" : "claude-opus-5-5",
          fallback,
        },
      ],
  ["done", {}],
];

/**
 * A local stand-in for the live tutor: /api/health reports `mode`, and every
 * POST /api/tutor gets the next of `replies`, an SSE event list or an HTTP
 * error `{ status, code }`. Records each request body.
 * @param {(ReturnType<typeof replyEvents> | { status: number, code: string })[]} replies
 * @param {string} [mode]
 */
async function fakeTutor(replies, mode = "live") {
  /** @type {any[]} */
  const bodies = [];
  const server = createServer(async (req, res) => {
    if (req.url === "/api/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", tutor_mode: mode }));
      return;
    }
    let text = "";
    for await (const chunk of req) text += chunk;
    bodies.push(JSON.parse(text));
    const reply = replies[Math.min(bodies.length - 1, replies.length - 1)];
    if (!Array.isArray(reply)) {
      res.writeHead(reply.status, { "Content-Type": "application/json", "Retry-After": "1" });
      res.end(JSON.stringify({ error: { code: reply.code, message: "" } }));
      return;
    }
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    for (const [event, data] of reply) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    res.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));
  const { port } = /** @type {import("node:net").AddressInfo} */ (server.address());
  return { url: `http://127.0.0.1:${port}`, bodies, close: () => server.close() };
}

/** A temp dir with the test plan and an empty output dir. */
async function workspace() {
  const dir = await mkdtemp(join(tmpdir(), "capture-"));
  await writeFile(join(dir, "plan.json"), JSON.stringify(PLAN));
  return {
    dir,
    plan: pathToFileURL(join(dir, "plan.json")),
    out: pathToFileURL(join(dir, "recorded/")),
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

const quiet = () => {};

test("capture saves each reply in the fixture shape, with history for a follow-up", async () => {
  const tutor = await fakeTutor([replyEvents()]);
  const ws = await workspace();
  try {
    const result = await capture({
      url: tutor.url,
      plan: ws.plan,
      out: ws.out,
      log: quiet,
      now: () => new Date("2026-10-07T12:00:00Z"),
    });
    assert.deepEqual(result.saved, ["bar4", "bar4-follow-up"]);
    const lesson = JSON.parse(await readFile(new URL("bar4.json", ws.out), "utf8"));
    assert.equal(lesson.name, "bar4");
    assert.equal(lesson.song, "ode-to-joy");
    assert.equal(lesson.description, "Bar 4");
    assert.equal(lesson.served_by, "claude-opus-5-5");
    assert.equal(lesson.model, "claude-opus-5-5");
    assert.equal(lesson.fallback, false);
    assert.equal(lesson.date, "2026-10-07");
    assert.deepEqual(
      lesson.events.map((/** @type {{ event: string }} */ e) => e.event),
      ["message", "message", "suggestions", "done"],
    );
    for (const e of lesson.events) {
      assert.deepEqual(Object.keys(e), ["event", "data", "delayMs"]);
      assert.ok(Number.isInteger(e.delayMs) && e.delayMs >= 0);
    }
    // The request is what the app would send: its snapshot, with the chord placed.
    assert.deepEqual(lesson.request, tutor.bodies[0]);
    assert.equal(lesson.request.snapshot.key.provisional, false);
    assert.deepEqual(lesson.request.snapshot.bars[0].chords, [
      { beat: 1, numeral: "I", nashville: "1", letter: "D" },
    ]);
    // The follow-up carries the first exchange as history.
    assert.deepEqual(tutor.bodies[1].history, [
      { role: "student", text: "What chord could go under bar 4, beat 3?" },
      { role: "tutor", text: "Try two chords under the long E." },
    ]);
  } finally {
    tutor.close();
    await ws.cleanup();
  }
});

test("capture refuses a reply a fallback model served, and skips its follow-up", async () => {
  const tutor = await fakeTutor([replyEvents({ fallback: true })]);
  const ws = await workspace();
  /** @type {string[]} */
  const lines = [];
  try {
    const result = await capture({
      url: tutor.url,
      plan: ws.plan,
      out: ws.out,
      log: (line) => lines.push(line),
    });
    assert.deepEqual(result.saved, []);
    assert.deepEqual(result.refused, ["bar4"]);
    assert.deepEqual(result.skipped, ["bar4-follow-up"]);
    await assert.rejects(readdir(ws.out), { code: "ENOENT" });
    assert.match(lines.join("\n"), /bar4: a fallback model served this reply/);
  } finally {
    tutor.close();
    await ws.cleanup();
  }
});

test("capture reports an error event and saves nothing for it, then moves on", async () => {
  const tutor = await fakeTutor([replyEvents({ error: true }), replyEvents()]);
  const ws = await workspace();
  /** @type {string[]} */
  const lines = [];
  try {
    const result = await capture({
      url: tutor.url,
      plan: ws.plan,
      out: ws.out,
      only: ["bar4"],
      log: (line) => lines.push(line),
    });
    assert.deepEqual(result.refused, ["bar4"]);
    await assert.rejects(readdir(ws.out), { code: "ENOENT" });
    assert.match(lines.join("\n"), /error event \(upstream\)/);
  } finally {
    tutor.close();
    await ws.cleanup();
  }
});

test("capture won't record from a tutor in fixture mode", async () => {
  const tutor = await fakeTutor([replyEvents()], "fixture");
  const ws = await workspace();
  try {
    await assert.rejects(
      capture({ url: tutor.url, plan: ws.plan, out: ws.out, log: quiet }),
      /fixture mode/,
    );
    assert.deepEqual(tutor.bodies, []);
  } finally {
    tutor.close();
    await ws.cleanup();
  }
});

for (const [status, code] of /** @type {const} */ ([
  [401, "access_required"],
  [429, "access_locked"],
])) {
  test(`a ${status} ${code} stops the run without printing the code`, async () => {
    const tutor = await fakeTutor([{ status, code }]);
    const secret = "treble clef";
    try {
      const run = promisify(execFile)(process.execPath, [script.pathname, "--url", tutor.url], {
        env: { ...process.env, TUTOR_ACCESS_CODE: secret },
      });
      await assert.rejects(run, (/** @type {any} */ error) => {
        assert.equal(error.code, 1);
        const output = error.stdout + error.stderr;
        assert.match(output, /Stopped: The live tutor/);
        assert.doesNotMatch(output, /treble|clef/i);
        return true;
      });
      // The first refusal ends the run: no request after it.
      assert.equal(tutor.bodies.length, 1);
    } finally {
      tutor.close();
    }
  });
}
