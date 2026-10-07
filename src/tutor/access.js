/**
 * The live tutor's passphrase, sent as the X-Tutor-Access header (DECISIONS.md,
 * "The live tutor requires a passphrase"). Whether the user types it or it
 * comes from a `#code=` link, it is kept in sessionStorage for this tab, so a
 * reload still works (Matthew, overruling the earlier memory-only rule for
 * typed codes). A link's code is read once on load and removed from the
 * address bar. A code the server rejects is forgotten. Nothing goes to
 * localStorage.
 */

const STORAGE_KEY = "hearhear.tutorAccess";

/**
 * Split a `#code=` parameter out of a URL fragment.
 * @param {string} hash e.g. "#code=open%20sesame"
 * @returns {{ code: string, rest: string }} the code ("" if none) and the
 *   fragment without it ("" if nothing is left, otherwise starting with "#")
 */
export function codeFromFragment(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const code = (params.get("code") ?? "").trim();
  if (!params.has("code")) return { code, rest: hash };
  params.delete("code");
  const rest = params.toString();
  return { code, rest: rest ? `#${rest}` : "" };
}

/**
 * The page's access to the live tutor.
 * @param {{
 *   location: { pathname: string, search: string, hash: string },
 *   history: { state: unknown, replaceState: (state: unknown, unused: string, url: string) => void },
 *   sessionStorage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
 * }} page the browser's `window`, or a stand-in for tests
 */
export function createAccess(page) {
  let code = "";

  /** @param {() => void} action @param {string} what */
  function store(action, what) {
    try {
      action();
    } catch (error) {
      // Storage can be blocked (private modes, site settings). The code still
      // works for this page; only a refresh will ask again.
      console.warn(`Couldn't ${what} the tutor passphrase for this tab`, error);
    }
  }

  return {
    /** Read the code once on load: a `#code=` link first, then this tab's earlier one. */
    load() {
      const { location, history } = page;
      const fromLink = codeFromFragment(location.hash);
      if (fromLink.code) {
        code = fromLink.code;
        store(() => page.sessionStorage.setItem(STORAGE_KEY, code), "keep");
      }
      if (fromLink.rest !== location.hash) {
        history.replaceState(
          history.state,
          "",
          location.pathname + location.search + fromLink.rest,
        );
      }
      if (!code) {
        store(() => (code = page.sessionStorage.getItem(STORAGE_KEY) ?? ""), "read");
      }
    },

    /** The code to send, or "" for none. */
    get: () => code,

    /** Use a code the user typed, and keep it for this tab. @param {string} typed */
    set(typed) {
      code = typed.trim();
      store(() => page.sessionStorage.setItem(STORAGE_KEY, code), "keep");
    },

    /** The server turned the code away: stop sending it, and don't bring it back on refresh. */
    forget() {
      code = "";
      store(() => page.sessionStorage.removeItem(STORAGE_KEY), "forget");
    },
  };
}
