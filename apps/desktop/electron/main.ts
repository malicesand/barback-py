import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'node:path';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import readline from 'readline';
import { fileURLToPath } from "node:url";


let py: import('child_process').ChildProcessWithoutNullStreams | null = null;
let win: BrowserWindow | null = null;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

//TODO theme stuff 
// // const isDark = nativeTheme.shouldUseDarkColors;

// ipcMain.handle("ping", () => ({
//   msg: "pong from main",
//   electron: process.versions.electron,
//   pid: process.pid,
// }));

// register this before or inside app.whenReady(), but before the renderer invokes it
// ipcMain.handle('py:send', (_evt, payload) => {
//   // You can stub this until Python is wired up
//   console.log('[py:send] got payload from renderer:', payload);
//   // return something to the renderer:
//   return true; // or { ok: true }
// });

// ipcMain.handle('py:send', async (_evt, payload) => {
//   // pretend we sent it to Python
//   // you could even echo a fake event back to the renderer:
//   win?.webContents.send('py:event', { type: 'echo', payload });
//   console.log('[py:send] got payload from renderer:', payload);
//   return { ok: true };
// });

// Ensure only one instance of the app runs
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
} else {
  app.on("second-instance", () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

// Window Properties
function createWindow() {
  if (win) return; // guard
  console.log('[main] creating window')

  win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#00000001',
    // transparent: true,
    // titleBarStyle: 'hiddenInset',
    // vibrancy: 'under-window',
    // visualEffectState: 'active',
    // backgroundMaterial: 'mica',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '../index.html'));
  }

  win.on('closed', () => (win = null));
}

// Python Launch Code
function spawnPython() {
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  const scriptPath = path.join(__dirname, '../../../py-project/watch_card.py')

  // Python to access on open
  py = spawn(pythonCmd, [scriptPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Parse stdout as NDJSON
  const rl = readline.createInterface({ input: py.stdout });
  rl.on('line', (line) => {
    try {
      const msg = JSON.parse(line);
      if (win) win.webContents.send('py:event', msg);
    } catch {
      if (win) win.webContents.send('py:event', { type: 'error', error: 'invalid_json', raw: line });
      //!If Python prints anything non-JSON, forward as a debug event
      // win?.webContents.send('py:event', { type: 'debug', line });
    }
  })

  // --- stderr -------------------------------------
  // python prints to window
  py.stderr.setEncoding('utf8');

  let errBuf = '';

  py.stderr.on('data', (chunk: string) => {
    errBuf += chunk;
    for (;;) {
      const nl = errBuf.indexOf('\n');
      if (nl < 0) break;
      const line = errBuf.slice(0, nl).replace(/\r$/, '');
      errBuf = errBuf.slice(nl + 1);

      if (win) win.webContents.send('py:stderr', line);
    }
  });

  py.on('exit', (code, signal) => {
    console.warn(`[PY EXIT] code=${code} signal=${signal}`);
    if (win) win.webContents.send('py:event', { type: 'py_exit', code, signal });
    py = null;
  });

  // Renderer -> Python (JSON per)
  ipcMain.handle('py:send', (_evt, payload: unknown) => {
    if (!py) throw new Error('Python not running');
    py.stdin.write(JSON.stringify(payload) + '\n');
    return true;
  });

  ipcMain.handle('ping', () => 'pong');
};

// Open Window
app.whenReady().then(() => {
  createWindow();
  spawnPython();
  // macOS: only recreate when none exist
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // // renderer -> python (send command objects)
  // ipcMain.handle('py:send', (_evt, payload: unknown) => {
  //   if (!py || !py.stdin.writable) return false;
  //   try {
  //     py.stdin.write(JSON.stringify(payload) + '\n');
  //     return true;
  //   } catch {
  //     return false;
  //   }
  // });

  app.on('before-quit', () => {
    try { py?.kill(); } catch {}
  });
});

// App close behavior
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});