import { ipcMain, app, BrowserWindow } from "electron";
import path from "node:path";
import { spawn } from "child_process";
import readline from "readline";
import { fileURLToPath } from "node:url";
let py = null;
let win = null;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
ipcMain.handle("ping", () => ({
  msg: "pong from main",
  electron: process.versions.electron,
  pid: process.pid
}));
ipcMain.handle("py:send", async (_evt, payload) => {
  win?.webContents.send("py:event", { type: "echo", payload });
  return { ok: true };
});
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
} else {
  app.on("second-instance", () => {
    const [win2] = BrowserWindow.getAllWindows();
    if (win2) {
      if (win2.isMinimized()) win2.restore();
      win2.focus();
    }
  });
}
function createWindow() {
  if (win) return;
  console.log("[main] creating window");
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    // backgroundColor: '#00000001',
    // transparent: true,
    // titleBarStyle: 'hiddenInset',
    // vibrancy: 'under-window',
    // visualEffectState: 'active',
    // backgroundMaterial: 'mica',
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, "../index.html"));
  }
  win.on("closed", () => win = null);
}
function spawnPython() {
  const pythonCmd = process.platform === "win32" ? "python" : "python3";
  py = spawn(pythonCmd, [path.join(__dirname, "../../../barback/watcher.py")], {
    stdio: ["pipe", "pipe", "pipe"]
  });
  const rl = readline.createInterface({ input: py.stdout });
  rl.on("line", (line) => {
    try {
      const msg = JSON.parse(line);
      if (win) win.webContents.send("py: event", msg);
    } catch (e) {
      if (win) win.webContents.send("py: event", { type: "error", error: "invalid_json", raw: line });
    }
  });
  py.stderr.on("data", (buf) => {
    const text = buf.toString();
    if (win) win.webContents.send("py:stderr", text);
    console.error("[PY STDERR]", text);
  });
  py.on("exit", (code, signal) => {
    console.warn(`[PY EXIT] code=${code} signal=${signal}`);
    if (win) win.webContents.send("py:event", { type: "py_exit", code, signal });
    py = null;
  });
}
app.whenReady().then(() => {
  createWindow();
  spawnPython();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  ipcMain.handle("py:send", (_evt, payload) => {
    if (!py || !py.stdin.writable) return false;
    try {
      py.stdin.write(JSON.stringify(payload) + "\n");
      return true;
    } catch {
      return false;
    }
  });
  app.on("before-quit", () => {
    try {
      py?.kill();
    } catch {
    }
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
