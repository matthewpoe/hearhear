// Apply a remembered dark theme and staff panel before first paint, so
// dark-mode viewers never see a flash of the light page or the wrong panel. A
// classic script in <head> (not inline: the CSP allows only same-origin
// scripts). src/theme.js and src/staffPanel.js own them after load.
try {
  if (localStorage.getItem("hearhear.theme") === "dark") {
    document.documentElement.dataset.theme = "dark";
  }
  if (localStorage.getItem("hearhear.staffPanel") === "paper") {
    document.documentElement.dataset.staffPanel = "paper";
  }
} catch {
  // Storage blocked (private mode, disabled site data): stay light, on slate.
}
