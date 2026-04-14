const { app, BrowserWindow } = require("electron");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      devTools: false // 🔥 disable inspect
    }
  });

  // remove top menu completely
  win.setMenu(null);

  // load app
  win.loadFile(path.join(__dirname, "dist", "index.html"));

  // show when ready
  win.once("ready-to-show", () => {
    win.show();
    win.focus();
  });

  // 🔥 block devtools shortcuts
  win.webContents.on("before-input-event", (event, input) => {
    if (
      input.key === "F12" ||
      (input.control && input.shift && input.key.toLowerCase() === "i") ||
      (input.control && input.shift && input.key.toLowerCase() === "j")
    ) {
      event.preventDefault();
    }
  });

  // 🔥 disable right click
  win.webContents.on("context-menu", (e) => {
    e.preventDefault();
  });

  // optional logs (safe)
  win.webContents.on("did-finish-load", () => {
    console.log("Game loaded successfully");
  });

  win.webContents.on("did-fail-load", (_, errorCode, errorDescription) => {
    console.error("Load error:", errorCode, errorDescription);
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});