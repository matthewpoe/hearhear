import { mount } from "svelte";
import "./tokens.css";
import "./global.css";
import App from "./App.svelte";
import { song } from "./store/song.js";
import { ui } from "./store/ui.js";
import { installPersistence } from "./store/persist.js";
import { loadDemo } from "./finding/demoTunes.js";
import { stop } from "./audio/index.js";

const target = document.getElementById("app");
if (!target) throw new Error("Missing #app mount point");

// Songs remember themselves for this tab, and a reload reopens the last one,
// before the first render so the page never flashes the empty song.
const memory = installPersistence({
  song,
  ui,
  storage: () => window.sessionStorage,
  fresh: loadDemo,
  stop,
});
window.addEventListener("pagehide", memory.flush);

export default mount(App, { target });
