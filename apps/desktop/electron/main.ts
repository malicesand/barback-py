import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'node:path';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import readline from 'readline';
import { fileURLToPath } from "node:url";
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import fs from 'node:fs/promises';
import keytar from 'keytar';

// --- Google Auth -------------------------------------------------------
const SERVICE_NAME = 'Calendar-Connect';
const ACCOUNT_NAME = 'google-oauth-token';
const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];

// Load Desktop OAuth client (client_id, 'secret' ignored)
async function loadClientJSON() {
  const credPath = path.join(process.resourcesPath, 'oauth_client.json');
  try {
    return JSON.parse(await fs.readFile(credPath, 'utf8'));
  } catch {
    // dev fallback
    const devPath = path.join(process.cwd(), 'credentials/oauth_client.json');
    return JSON.parse(await fs.readFile(devPath, 'utf8'));
  }
}

// Restore tokens (if any)
async function loadTokens(): Promise<any | null> {
  const json = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
  return json ? JSON.parse(json) : null;
}
async function saveTokens(tokens: any) {
  await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, JSON.stringify(tokens));
}

async function getAuthorizedClient(): Promise<OAuth2Client> {
  const { installed } = await loadClientJSON();
  const OAuth2Client = new google.auth.OAuth2(
    installed.client_id,
    installed.client_secret, 
    'http://localhost:3000'
  );
  
  // Try existing tokens
  const cached = await loadTokens();
  if (cached) {
    OAuth2Client.setCredentials(cached);
    return OAuth2Client;
  }
  // New auth: PKCE + loopback. Build URL and open the system browser
  // google-auth-library provides helper for authCode with local server:
  const authUrl = OAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });

  // openExternal and run built-in codeReceiver
  const { shell } = await import('electron');
  await shell.openExternal(authUrl);

  // Start local code receiver to wait for Google redirect
  const { code } = await (OAuth2Client as any).getToken({
    //?
  });

  const { tokens } = await OAuth2Client.getToken(code);
  OAuth2Client.setCredentials(tokens);
  await saveTokens(tokens);
  return OAuth2Client;
}

// IPC: connect + fetch upcoming events -> JSON
ipcMain.handle('google: fetchEvents', async (_evt, { calendarId, timeMin, timeMax, maxResults = 2500 }) => {
  const auth = await getAuthorizedClient();
  const calendar = google.calendar({ version: 'v3', auth });
  const res = await calendar.events.list({
    calendarId: calendarId || 'primary',
    timeMin, timeMax, maxResults, singleEvents: true, orderBy: 'startTime',
  });
  return res.data; // already JSON serializable
});

// --- Electron Window  ---------------------------------------------

let py: import('child_process').ChildProcessWithoutNullStreams | null = null;
let win: BrowserWindow | null = null;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

//TODO theme stuff 
// // const isDark = nativeTheme.shouldUseDarkColors;



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

//--- Calendar Window ---------------
function createCalWin() {
  calWindow = new BrowserWindow
}