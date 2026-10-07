import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { asksForCode, codeFromFragment, createAccess } from "../../src/tutor/access.js";

/**
 * A stand-in page at `url`, with a working sessionStorage unless `storage` replaces it.
 * @param {string} url
 * @param {any} [storage]
 */
function page(url, storage) {
  const { pathname, search, hash } = new URL(url, "https://hearhear.test");
  const items = new Map();
  /** @type {string[]} every URL replaceState was given */
  const replaced = [];
  return {
    location: { pathname, search, hash },
    replaced,
    history: {
      state: null,
      /** @param {unknown} _state @param {string} _unused @param {string} next */
      replaceState(_state, _unused, next) {
        replaced.push(next);
      },
    },
    sessionStorage: storage ?? {
      /** @param {string} key */
      getItem: (key) => items.get(key) ?? null,
      /** @param {string} key @param {string} value */
      setItem: (key, value) => items.set(key, value),
      /** @param {string} key */
      removeItem: (key) => items.delete(key),
    },
  };
}

describe("codeFromFragment", () => {
  it("takes the code out and keeps the rest of the fragment", () => {
    assert.deepEqual(codeFromFragment("#code=open%20sesame"), { code: "open sesame", rest: "" });
    assert.deepEqual(codeFromFragment("#demo=ode&code=x"), { code: "x", rest: "#demo=ode" });
  });

  it("leaves a fragment with no code alone", () => {
    assert.deepEqual(codeFromFragment("#tutor"), { code: "", rest: "#tutor" });
    assert.deepEqual(codeFromFragment(""), { code: "", rest: "" });
  });

  it("removes an empty code", () => {
    assert.deepEqual(codeFromFragment("#code="), { code: "", rest: "" });
  });
});

describe("createAccess", () => {
  afterEach(() => mock.restoreAll());

  it("reads a #code= link, keeps it for this tab, and clears the address bar", () => {
    const tab = page("/play?x=1#code=open%20sesame");
    const access = createAccess(tab);
    access.load();
    assert.equal(access.get(), "open sesame");
    assert.deepEqual(tab.replaced, ["/play?x=1"]);

    // A refresh: the fragment is gone, and this tab still has the code.
    const refreshed = createAccess({ ...tab, location: { ...tab.location, hash: "" } });
    refreshed.load();
    assert.equal(refreshed.get(), "open sesame");
  });

  it("keeps a typed code for this tab, so a reload still has it", () => {
    const tab = page("/");
    const access = createAccess(tab);
    access.load();
    access.set("  typed  ");
    assert.equal(access.get(), "typed");
    assert.equal(tab.sessionStorage.getItem("hearhear.tutorAccess"), "typed");
    assert.deepEqual(tab.replaced, []);

    const reloaded = createAccess(tab);
    reloaded.load();
    assert.equal(reloaded.get(), "typed");
  });

  it("forgets a rejected typed code for a reload too", () => {
    const tab = page("/");
    const access = createAccess(tab);
    access.load();
    access.set("wrong");
    access.forget();
    const reloaded = createAccess(tab);
    reloaded.load();
    assert.equal(reloaded.get(), "");
  });

  it("still uses a typed code when storage is blocked", () => {
    const warn = mock.method(console, "warn", () => {});
    const blocked = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    const access = createAccess(
      page("/", { getItem: blocked, setItem: blocked, removeItem: blocked }),
    );
    access.load();
    access.set("open");
    assert.equal(access.get(), "open");
    assert.equal(warn.mock.callCount(), 2);
  });

  it("forgets a rejected code, in memory and for a refresh", () => {
    const tab = page("/#code=wrong");
    const access = createAccess(tab);
    access.load();
    access.forget();
    assert.equal(access.get(), "");
    const refreshed = createAccess({ ...tab, location: { ...tab.location, hash: "" } });
    refreshed.load();
    assert.equal(refreshed.get(), "");
  });

  it("still uses a linked code when storage is blocked", () => {
    const warn = mock.method(console, "warn", () => {});
    const blocked = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    const access = createAccess(
      page("/#code=open", { getItem: blocked, setItem: blocked, removeItem: blocked }),
    );
    access.load();
    assert.equal(access.get(), "open");
    assert.equal(warn.mock.callCount(), 1);
  });
});

describe("asksForCode", () => {
  const quiet = { live: false, hasCode: false, changing: false, failure: "" };

  it("asks up front when the server is live and no code is saved", () => {
    assert.equal(asksForCode({ ...quiet, live: true }), true);
  });

  it("doesn't ask a live server's student who has a code, until they change it", () => {
    assert.equal(asksForCode({ ...quiet, live: true, hasCode: true }), false);
    assert.equal(asksForCode({ ...quiet, live: true, hasCode: true, changing: true }), true);
  });

  it("never asks up front in demo mode", () => {
    assert.equal(asksForCode(quiet), false);
  });

  it("asks after a turned-away question in any mode, but not after a lockout", () => {
    assert.equal(asksForCode({ ...quiet, failure: "access_required" }), true);
    assert.equal(asksForCode({ ...quiet, hasCode: true, failure: "access_locked" }), false);
    assert.equal(asksForCode({ ...quiet, failure: "network" }), false);
  });
});
