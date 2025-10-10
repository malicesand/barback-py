import { app, BrowserWindow, ipcMain, shell, safeStorage } from 'electron';
import * as path from 'node:path';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import readline from 'readline';
import { fileURLToPath } from "node:url";
import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import fs from 'node:fs/promises';
import fssync from 'fs';
import http from 'http';
import { URL } from 'url';



// --- Google API -------------------------------------------------------
// const SERVICE_NAME = 'Calendar-Connect';
// const ACCOUNT_NAME = 'google-oauth-token';
const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];
const TOKENS_FILE = path.join(app.getPath('userData'), 'google-oauth.enc')

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

async function saveTokens(tokens: any) {
  const plaintext = JSON.stringify(tokens);
  // Encrypt if available; otherwise write plain
  const bytes = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(plaintext) : Buffer.from(plaintext, 'utf8');
  // ensure dir exists
  await fs.mkdir(path.dirname(TOKENS_FILE), { recursive: true }); 
  await fs.writeFile(TOKENS_FILE, bytes);

}
// Restore tokens (if any)
async function loadTokens(): Promise<any | null> {
  if (!fssync.existsSync(TOKENS_FILE)) return null;

  const buf = await fs.readFile(TOKENS_FILE);
  let jsonStr: string;

  if (safeStorage.isEncryptionAvailable()) {
    try {
      jsonStr = safeStorage.decryptString(buf);
    } catch {
      // fallback if the file somehow isn’t encrypted
      jsonStr = buf.toString('utf8');
    }
  } else {
    jsonStr = buf.toString('utf8');
  }

  try { return JSON.parse(jsonStr); } catch { return null; }
}


function createOAuthClient(redirectUri: string, installed: any) {
  return new google.auth.OAuth2(
    installed.client_id,
    installed.client_secret,
    redirectUri
  );
}

// Loopback: Open browser, wait for code on local host
async function runLoopBackAuth(installed: any) {
  const server = http.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  if (!port) {
    server.close();
    throw new Error('Failed to bind local OAuth port');
  }

  const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
  const client = createOAuthClient(redirectUri, installed);

  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });

  await shell.openExternal(authUrl);

  const tokens = await new Promise<any>((resolve, reject) => {
    server.on('request', async (req, res) => {
      try {
        if (!req.url) return;
        const u = new URL(req.url, `http://127.0.0.1:${port}`);
        if (u.pathname !== '/oauth2callback') return;

        const code = u.searchParams.get('code');
        const err = u.searchParams.get('error');

        res.writeHead(200, { 'Content-Type': 'text/html' });
        
        if (err) {
          res.end('<h3>Authorization failed. You can close this window.</h3>');
          server.close();
          reject(new Error(err));
          return;
        }
        if (!code) {
          res.end('<h3>No code received. You can close this window.</h3>');
          server.close();
          reject(new Error('No authorization code'));
          return;
        }

        const { tokens } = await client.getToken(code);
        res.end('<h3>Connected! You can close this tab and return to the app.</h3>');
        server.close();
        resolve(tokens);
      } catch (e) {
        try { res.end('<h3>Unexpected error. You can close this window.</h3>'); } catch {}
        server.close();
        reject(e);
      }
    });
  });

  client.setCredentials(tokens);
  await saveTokens(tokens);
  return client;
}

/**
 * Convert a Calendar API response to JSON shape
 * { [MEID] : [startISO, endISO] }
 *  - MEID = first 4 chars of event.title
 *  - Uses event.start/end.dateTime if present; falls back to .date (all-day)
 *  - If duplicate MEIDs occur, later events overwrite earlier (proviso for updates)
 */
function toCalMap(events: calendar_v3.Schema$Events): Record<string, [string, string]> {
  const out: Record<string, [string, string]> = {};
  const items = events.items ?? [];
  for (const ev of items) {
    const title = ev.summary ?? '';
    const meid = title.slice(0, 4);
    if (!meid || meid.length < 4) continue;

    const start = ev.start?.dateTime ?? ev.start?.date;
    const end = ev.end?.dateTime ?? ev.end?.date;
    if (!start || !end) continue;

    // Keep the RFC3339 strings as returned by API (already ISO-like with offsets)
    out[meid] = [start, end];
  }
  return out;
}
/** Data Directory for JSON Imports */
function isDev() {
  return !!process.env.VITE_DEV_SERVER_URL;
}
function getDataDir(): string {
  const devDir = path.join(__dirname, '../../../py-project/data/');
  const prodDir = path.join(app.getPath('userData'), 'data');
  const dir = isDev() ? devDir : prodDir;
  if (!fssync.existsSync(dir)) fssync.mkdirSync(dir, { recursive: true });
  console.log('[MAIN] Uploaded')
  return dir;
}

async function writeCalendarJsonFile(baseName: string, json: string) {
  const dir = getDataDir();
  const filePath = path.join(dir, baseName);
  await fs.writeFile(filePath, json, 'utf8');
  return filePath;
}
// Fetch one calendar's events and return file path and calendar name
async function exportOneCalendarToDataDir(opts: {
  calendarId: string;
  timeMin: string;
  timeMax: string;
  suggestName?: string; // e.g., "schedule_sam.json"
}) {
  const auth = await getAuthorizedClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const [calMeta, evRes] = await Promise.all([
    calendar.calendars.get({ calendarId: opts.calendarId }),
    calendar.events.list({
      calendarId: opts.calendarId,
      timeMin: opts.timeMin,
      timeMax: opts.timeMax,
      maxResults: 2500,
      singleEvents: true,
      orderBy: 'startTime',
    }),
  ]);

  const calName = (calMeta.data.summary || 'calendar')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

  const calMap = toCalMap(evRes.data);
  const json = JSON.stringify(calMap, null, 2);

  const baseName = opts.suggestName ?? `schedule_${calName.slice(0, 3)}.json`;
  const filePath = await writeCalendarJsonFile(baseName, json);

  return { ok: true as const, filePath, calName };
}

async function getAuthorizedClient(): Promise<import('google-auth-library').OAuth2Client> {
  const { installed } = await loadClientJSON();
 
  // Try existing tokens with redirect URI
  const cached = await loadTokens();
  if (cached) {
    const client = createOAuthClient('http://127.0.0.1', installed);
    client.setCredentials(cached);
    return client;
  }
  // Otherwise run the loopback login
  const client = await runLoopBackAuth(installed);
  return client;
}

function registerGoogleIpc() {
  console.log('[MAIN] registering Google IPC...');
  // Connect and open Upload Window
  ipcMain.handle('google:connectAndOpenUpload', async () => {
    await getAuthorizedClient(); // triggers login if needed
    openUploadWindow();
    // You can also return profile/calendar list here if you want
    return { ok: true };
  });

  // List Calendars the user has access to (id + summary)
  ipcMain.handle('google:listCalendars', async () => {
    const auth = await getAuthorizedClient();
    const calendar = google.calendar({ version: 'v3', auth });
    const res = await calendar.calendarList.list({ maxResults: 250 });
    // minimal shape for UI
    const items = (res.data.items ?? []).map((c: calendar_v3.Schema$CalendarListEntry) => ({
      id: c.id!,
      summary: c.summary || c.id!,
      primary: Boolean(c.primary),
    }));
    return items;
  });
  // Fetch events for a single calendar within a date range (raw API response)
  ipcMain.handle('google:fetchEvents', async (_evt, opts: {
    calendarId?: string;
    timeMin?: string;
    timeMax?: string;
    maxResults?: number;
  }) => {
    const auth = await getAuthorizedClient();
    const calendar = google.calendar({ version: 'v3', auth});

    const res = await calendar.events.list({
      calendarId: opts.calendarId || 'primary',
      timeMin: opts.timeMin,
      timeMax: opts.timeMax,
      maxResults: opts.maxResults ?? 250,
      singleEvents: true,
      orderBy: 'startTime',
    });
    return res.data
  });

  /** Export ONE calendar to a JSON file shaped*/
  ipcMain.handle('google:exportCalendarJson', async (_evt, opts: {
    calendarId: string;
    timeMin: string; // e.g., '2025-07-19T00:00:00-05:00'
    timeMax: string;
    suggestedFilename?: string; // e.g., 'schedule_jkb.json'
  }) => {
    // const auth = await getAuthorizedClient();
    // const calendar = google.calendar({ version: 'v3', auth});

    try {
      const r = await exportOneCalendarToDataDir({
        calendarId: opts.calendarId,
        timeMin: opts.timeMin,
        timeMax: opts.timeMax,
        suggestName: opts.suggestedFilename,
      });
      return r; // { ok: true, filePath, calName }
    } catch (e: any) {
      return { ok: false as const, error: String(e?.message ?? e) };
    }
    // const [calMeta, evRes] = await Promise.all([
    //   calendar.calendars.get({ calendarId: opts.calendarId }),
    //   calendar.events.list({
    //     calendarId: opts.calendarId,
    //     timeMin: opts.timeMin,
    //     timeMax: opts.timeMax,
    //     maxResults: 250,
    //     singleEvents: true,
    //     orderBy: 'startTime',
    //   }),
    // ]),

    // const calMap = toCalMap(evRes.data); // renamed meidMap -> calMap
    // const json = JSON.stringify(calMap, null, 2);

    // // filename like 'schedule_<slug>.json'
    // const calName = (calMeta.data.summary || 'calendar').toLowerCase()
    //   .replace(/\s+/g, '_')
    //   .replace(/[^a-z0-9_]/g, '');

    // const baseName = opts.suggestedFilename ?? `schedule_${calName}.json`;
    // const filePath = await writeCalendarJsonFile(baseName, json);

    // return { ok: true as const, filePath, calName };
  });

  /** Export MULTIPLE calendars at once (shows save dialog for each) */
  ipcMain.handle('google:exportMultipleCalendarsJson', async (_evt, opts: {
    calendarIds: string[];
    timeMin: string;
    timeMax: string;
  }) => {
    const results: Array<{ id: string; ok: boolean; filePath?: string; error?: string }> = [];
    for (const id of opts.calendarIds) {
      try {
        const r = await exportOneCalendarToDataDir({
          calendarId: id,
          timeMin: opts.timeMin,
          timeMax: opts.timeMax,
        });
        results.push({ id, ok: true, filePath: r.filePath });
      } catch (e: any) {
        results.push({ id, ok: false, error: String(e?.message ?? e) });
      }
    }
    return results;
  });
  console.log('[MAIN] registered ipcs')
}

// --- Electron Window  ---------------------------------------------

let py: import('child_process').ChildProcessWithoutNullStreams | null = null;
let win: BrowserWindow | null = null;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let uploadWin: BrowserWindow | null = null;
//TODO theme stuff 
// // const isDark = nativeTheme.shouldUseDarkColors;


function openUploadWindow() {
  if (uploadWin && !uploadWin.isDestroyed()) {
    uploadWin.show();
    uploadWin.focus();
    return;
  }
  uploadWin = new BrowserWindow({
    width: 960,
    height: 720,
    title: 'Google Calendar Upload',
    webPreferences: {
     preload: path.join(__dirname, 'preload.mjs'),
     contextIsolation: true,
     nodeIntegration: false,
    
    }
  });

  // Route by hash (local host) in dev
  // In production load apps file/Url and route to upload
  if (process.env.VITE_DEV_SERVER_URL) {
    uploadWin.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/upload`);
  } else {
    // adjust if you use file:// scheme from Vite build output
    uploadWin.loadURL(`app://index.html#/upload`);
  }

  uploadWin.on('closed', () => (uploadWin = null));
}


// Ensure only one instance of the app runs
// const gotLock = app.requestSingleInstanceLock();
// if (!gotLock) {
//   app.quit();
//   process.exit(0);
// } else {
//   app.on("second-instance", () => {
//     const [win] = BrowserWindow.getAllWindows();
//     if (win) {
//       if (win.isMinimized()) win.restore();
//       win.focus();
//     }
//   });
// }

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

// -- Python Launch Code -------
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
  registerGoogleIpc();
  spawnPython();
  createWindow();
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
