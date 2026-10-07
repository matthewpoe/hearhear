// Apply a remembered dark theme before first paint, so dark-mode viewers never
// see a flash of the light page. A classic script in <head> (not inline: the
// CSP allows only same-origin scripts). src/theme.js owns the theme after load.
try {
  if (localStorage.getItem("hearhear.theme") === "dark") {
    document.documentElement.dataset.theme = "dark";
  }
} catch {
  // Storage blocked (private mode, disabled site data): stay light.
}
