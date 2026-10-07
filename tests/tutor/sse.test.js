import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSseParser } from "../../src/tutor/sse.js";

/** Feed `chunks` to a fresh parser and return the events it emitted. */
function parse(...chunks) {
  /** @type {[string, string][]} */
  const events = [];
  const parser = createSseParser((event, data) => events.push([event, data]));
  for (const chunk of chunks) parser.push(chunk);
  parser.end();
  return events;
}

const STREAM =
  'event: message\ndata: {"delta":"Listen to bar 4."}\n\n' +
  'event: suggestions\ndata: {"suggestions":[]}\n\n' +
  "event: done\ndata: {}\n\n";

const EXPECTED = [
  ["message", '{"delta":"Listen to bar 4."}'],
  ["suggestions", '{"suggestions":[]}'],
  ["done", "{}"],
];

describe("createSseParser", () => {
  it("emits one call per complete event", () => {
    assert.deepEqual(parse(STREAM), EXPECTED);
  });

  it("gives the same events however the network splits the text", () => {
    for (const text of [STREAM, STREAM.replaceAll("\n", "\r\n"), STREAM.replaceAll("\n", "\r")]) {
      for (let size = 1; size <= 7; size++) {
        const chunks = [];
        for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
        assert.deepEqual(parse(...chunks), EXPECTED, `chunk size ${size}: ${JSON.stringify(text)}`);
      }
    }
  });

  it("holds an event back until its blank line arrives", () => {
    assert.deepEqual(parse("event: done\ndata: {}\n"), []);
    assert.deepEqual(parse("event: done\ndata: {}\n", "\n"), [["done", "{}"]]);
  });

  it("accepts CRLF and bare CR line endings, even split across chunks", () => {
    assert.deepEqual(parse(STREAM.replaceAll("\n", "\r\n")), EXPECTED);
    assert.deepEqual(parse(STREAM.replaceAll("\n", "\r")), EXPECTED);
    assert.deepEqual(parse("event: done\r\ndata: {}\r", "\n\r\n"), [["done", "{}"]]);
  });

  it("doesn't read a CRLF split across chunks as two line ends", () => {
    assert.deepEqual(parse("data: one\r", "\ndata: two\r\n\r\n"), [["message", "one\ntwo"]]);
  });

  it("treats a carried CR as a line end when the stream ends", () => {
    assert.deepEqual(parse("data: {}\r\r"), [["message", "{}"]]);
  });

  it("joins multi-line data with newlines", () => {
    assert.deepEqual(parse('data: {"delta":\ndata: "two lines"}\n\n'), [
      ["message", '{"delta":\n"two lines"}'],
    ]);
  });

  it("defaults the event to message, strips one leading space, and ignores comments", () => {
    assert.deepEqual(parse(": keep-alive\n\ndata:no space\n\ndata:  two spaces\nid: 7\n\n"), [
      ["message", "no space"],
      ["message", " two spaces"],
    ]);
  });

  it("skips an event with no data", () => {
    assert.deepEqual(parse("event: done\n\n"), []);
  });
});
