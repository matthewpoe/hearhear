/**
 * A minimal Server-Sent Events parser for a fetch body (EventSource is
 * GET-only, and the tutor endpoint is POST). Feed it decoded text in whatever
 * chunks the network delivers; it calls `onEvent` once per complete event.
 * Only the `event` and `data` fields are used (contracts/tutor-sse.md).
 *
 * @param {(event: string, data: string) => void} onEvent
 */
export function createSseParser(onEvent) {
  let buffer = "";

  /** @param {string} block one event's lines, without the blank line after it */
  function dispatch(block) {
    let event = "message";
    /** @type {string[]} */
    const data = [];
    for (const line of block.split("\n")) {
      if (line === "" || line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
      if (field === "event") event = value;
      else if (field === "data") data.push(value);
    }
    if (data.length) onEvent(event, data.join("\n"));
  }

  /** A chunk-final "\r" may be the first half of a "\r\n" split across chunks. */
  let carriedCr = false;

  /** @param {string} text */
  function feed(text) {
    buffer += text.replace(/\r\n?/g, "\n");
    let end;
    while ((end = buffer.indexOf("\n\n")) !== -1) {
      dispatch(buffer.slice(0, end));
      buffer = buffer.slice(end + 2);
    }
  }

  return {
    /** @param {string} text the next decoded chunk */
    push(text) {
      let next = carriedCr ? `\r${text}` : text;
      carriedCr = next.endsWith("\r");
      if (carriedCr) next = next.slice(0, -1);
      feed(next);
    },
    /** The stream has ended: a carried "\r" was a line end after all. */
    end() {
      if (carriedCr) feed("\n");
      carriedCr = false;
    },
  };
}
