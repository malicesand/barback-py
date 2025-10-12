import { app, BrowserWindow, ipcMain, shell, safeStorage } from 'electron';
import * as path from 'node:path';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import readline from 'readline';
import { fileURLToPath } from "node:url";
import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import fs from 'node:fs/promises';
import fssync from 'fs';
import { readFileSync, writeFileSync } from 'node:fs';
import http from 'http';
import { URL } from 'url';
import readline from 'node:readline';

let win: BrowserWindow | null = null;
// --- custom helper ---
function sendToRenderer(data: any) {
  if (win && win.webContents) {
    win.webContents.send('main:log', data);
  } 
};

const nativeConsole = { ...console };
(['log', 'info', 'warn', 'error'] as const).forEach((level) => {
  console[level] = (...args: any[]) => {
    // still print to Node console
    nativeConsole[level](...args);

    // also send to renderer
    try {
      sendToRenderer({
        level,
        args: args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
      });
    } catch (err) {
      nativeConsole.warn('sendToRenderer failed', err);
    }
  };
});
// ------------------------- Preload Debug ------------------------- //
// Preload exceptions 
app.on('web-contents-created', (_e, contents) => {
    contents.on('preload-error', (_event, preloadPath, error) => {
    console.error('[preload-error]', preloadPath, error);
  });
    contents.on('render-process-gone', (_e2, details) => {
    console.error('[render-process-gone]', details);
  });
    contents.on('did-fail-load', (_e3, code, desc, url) => {
    console.error('[did-fail-load]', { code, desc, url });
  });
});
// catch errors forwarded from preload
ipcMain.on('preload:error', (_e, msg) => console.error('[preload:error]', msg));

// ------------------------- Config  ------------------------- //
//! isDir bullshit especially with directory for data or whatever
const RUNTIME_BASE = app.isPackaged
  ? process.resourcesPath               // Barback.app/Contents/Resources
  : process.cwd();                      // apps/desktop while dev
if (app.isPackaged) app.setName('Barback Ingest Companion');

const RESOURCES_DIR = path.join(RUNTIME_BASE, 'resources'); // packaged via extraResources
const PYPROJ = path.join(RUNTIME_BASE, 'py-project');
const DATA_DIR = path.join(PYPROJ, 'data');
const CREDS_PATH = path.join(RESOURCES_DIR, 'credentials', 'oauth_client.json');

const USERDATA_DIR = app.getPath('userData');               // writable
const TOKEN_PATH = path.join(USERDATA_DIR, 'google', 'token.json');

async function ensureTokenDir() {
  await fs.mkdir(path.dirname(TOKEN_PATH), { recursive: true }).catch(() => {});
}

/* //! Think we don't need
async function ensureDefaultSchedules() { 
  const src = path.join(RESOURCES_DIR, 'schedules'); // put defaults here
  const dst = path.join(USERDATA_DIR, 'schedules');
  await fs.mkdir(dst, { recursive: true }).catch(() => {});
  try {
    const files = await fs.readdir(src);
    for (const f of files) {
      const from = path.join(src, f);
      const to = path.join(dst, f);
      try { await fs.access(to); } catch { await fs.copyFile(from, to); }
    }
  } catch {}
}
app.whenReady().then(ensureDefaultSchedules); */

// --------------------------- Google Login --------------------------- //
const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];
const TOKENS_FILE = path.join(app.getPath('userData'), 'google-oauth.enc')

// Load Desktop OAuth client (client_id, client_secret, redirect_uris)
async function loadClientJSON() {
  const prodCreds = path.join(process.resourcesPath, 'resources', 'credentials', 'oauth_client.json');
  const devCreds  = path.join(process.cwd(), 'credentials', 'oauth_client.json'); // your dev copy

  try {
    return JSON.parse(await fs.readFile(prodCreds, 'utf8'));
  } catch {
    return JSON.parse(await fs.readFile(devCreds, 'utf8'));
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
    // console.log('\n[AUTH] loadTokens from', TOKENS_FILE);
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
  //  console.log('[AUTH] token loaded OK');
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

// --------------------------- Cal Connect --------------------------- //
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

//! going to make dir = dir
//* Hypothesis Good For Dir
/** Data Directory for JSON Imports */
function isDev() {
  return !!process.env.VITE_DEV_SERVER_URL;
}
function getDataDir(): string {
  const devDir = path.join(__dirname, '../../../py-project/data/');
  const prodDir = DATA_DIR;
  const dir = isDev() ? devDir : prodDir;
  if (!fssync.existsSync(dir)) fssync.mkdirSync(dir, { recursive: true });
  console.log(`[MAIN] getDataDir: ${dir}`)
  //logToRenderer(`[MAIN] getDataDir${dir}`)
  return dir;
} 
//? maybe don't need getDataDir() bc prodDir = devDir
async function writeCalendarJsonFile(baseName: string, json: string) {
  const dir = getDataDir();
  const filePath = path.join(dir, baseName);
  await fs.writeFile(filePath, json, 'utf8');
  console.log(`\n[CAL] writeCalendarJsonFile(${baseName})`)
   console.log(` dir: ${dir})`)
   console.log(` filepath: ${filePath})`)
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
  
  console.log(`\n[CAL] exportOneCalendarToDataDir()`)
  console.log(` filepath: ${filePath} `)
  console.log(` calName: ${calName} \n`)
  return { ok: true as const, filePath, calName };
}

async function getAuthorizedClient(): Promise<import('google-auth-library').OAuth2Client> {
  //  console.log('\n[AUTH] entering getAuthorizedClient');
  const { installed } = await loadClientJSON();
  const cached = await loadTokens();
  //  console.log('[AUTH] cached?', !!cached);
  if (cached) {
    // Use the first redirect URI from the client JSON
    const fallback = 'http://127.0.0.1';
    const redirect = (installed?.redirect_uris?.[0]) ?? fallback;
    
    const client = createOAuthClient(redirect, installed);
    client.setCredentials(cached);
    return client;
  }
  const client = await runLoopBackAuth(installed);
  return client;

}

function registerGoogleIpc() {
  // Connect and open Calendar Upload Window
  console.log(`Data directory = ${DATA_DIR}`)
  ipcMain.handle('google:connectAndOpenUpload', async () => {
    try {
      // make sure packaged creds exist
      await fs.access(CREDS_PATH);
      console.log(`\n[MAIN] GoogleIPC Creds Path: ${CREDS_PATH})`)
    } catch {
      throw new Error(`Missing Google credentials at ${CREDS_PATH}`);
    }
    // Find or make token directory
    await ensureTokenDir();
    // Pass explicit paths to  auth layer
    await getAuthorizedClient();
    // Calendar upload window
    openUploadWindow();
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
  //! This calls exportOneCalendarToDataDir
  /** Export ONE calendar to a JSON file shaped*/
  ipcMain.handle('google:exportCalendarJson', async (_evt, opts: {
    calendarId: string;
    timeMin: string; // e.g., '2025-07-19T00:00:00-05:00'
    timeMax: string;
    suggestedFilename?: string; // e.g., 'schedule_jkb.json'
  }) => {
    console.log(`\n[ONE] exportCalendarJson(_evt, opts)`)
    
    try {
      const r = await exportOneCalendarToDataDir({ 
        calendarId: opts.calendarId,
        timeMin: opts.timeMin,
        timeMax: opts.timeMax,
        suggestName: opts.suggestedFilename,
      });
      // console.log(`\n[ONE] return 1 ${ {ok: true, filePath, calName} }`)
      return r; // { ok: true, filePath, calName }
      // console.log(`\n   [ONE] return 2 ${ {ok: true, filePath, calName} }`)
    } catch (e: any) {
      return { ok: false as const, error: String(e?.message ?? e) };
    }
  });
  /** Export MULTIPLE calendars at once (shows save dialog for each) */
  ipcMain.handle('google:exportMultipleCalendarsJson', async (_evt, opts: {
    calendarIds: string[];
    timeMin: string;
    timeMax: string;
  }) => {
    const results: Array<{ id: string; ok: boolean; filePath?: string; error?: string }> = [];
    for (const id of opts.calendarIds) {
      console.log(`[IPC] exporting calendar`)
      try {
        const r = await exportOneCalendarToDataDir({
          calendarId: id,
          timeMin: opts.timeMin,
          timeMax: opts.timeMax,
        });
        // console.log(`\n[EMC] 1 results.push(${ {id, ok: true, filePath: r.filePath} })`)
        results.push({ id, ok: true, filePath: r.filePath });
        // console.log(`\n   [EMC] 2 results.push(${ {ok: true, filePath, calName} })`)
      } catch (e: any) {
        results.push({ id, ok: false, error: String(e?.message ?? e) });
      }
    }
    // console.log(`\n[EMC]return `)
    return results;
  });
}

// --------------------------- Electron Windows  --------------------------- //

let py: import('child_process').ChildProcessWithoutNullStreams | null = null;
// let win: BrowserWindow | null = null;
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
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  

  if (devUrl) {
    // Dev: Vite server — include the hash route
    uploadWin.loadURL(`${devUrl}#/upload`);
    // uploadWin.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Prod: built file — use loadFile with hash option
    const indexHtml = path.join(__dirname, '../dist/index.html');
    uploadWin.loadFile(indexHtml, { hash: 'upload' });
  }

  uploadWin.once('ready-to-show', () => uploadWin?.show());
  

  uploadWin.on('closed', () => {
    uploadWin = null as unknown as BrowserWindow; // or set to null if typed that way
  });

  uploadWin.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('uploadWin did-fail-load:', { code, desc, url });
  });
}

// Main Window Properties
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
    }
  });
  
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  const isDev = !!devUrl;

  if (isDev) {
    // dev: plugin serves the renderer here
    win.loadURL(devUrl);
    // win.webContents.openDevTools({ mode: 'detach' });
  } else {
    // prod: load the built index.html (dist/index.html)
    // __dirname is <...>/dist-electron at runtime
    const indexHtml = path.join(__dirname, '../dist/index.html');
    win.loadFile(indexHtml);
  }

  win.once('ready-to-show', () => win?.show());
  
  // helpful diagnostics if something fails to load
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('did-fail-load:', { code, desc, url });
  });
  //! Dead?
  // if (process.env.VITE_DEV_SERVER_URL) {
  //   win.loadURL(process.env.VITE_DEV_SERVER_URL);
  // } else {
  //   win.loadFile(path.join(__dirname, '../index.html'));
  // }

  // win.on('closed', () => (win = null)); //? needed ?
}

// --------------------------- Python Launch Code --------------------------- //
function spawnPython() {
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  
  const scriptPath = app.isPackaged ? path.join(PYPROJ, 'watch_card.py') : path.join(__dirname, '../../../py-project/watch_card.py')
  console.log('[PY] scriptPath', scriptPath, 'exists?', fssync.existsSync(scriptPath));
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

  //  ------------------------- stderr ------------------------- //
  // set python logs to print to devConsole
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

// ----------------------------- When Ready ----------------------------- //
app.whenReady().then(() => {
  registerGoogleIpc();
  spawnPython();
  createWindow();

  // console.log('\n[APP]', 'name=', app.getName());
  // console.log('[APP]', 'data dir=', DATA_DIR);
  // console.log('[APP]', 'userData=', app.getPath('userData'));
  // console.log('[APP]', 'resourcesPath=', process.resourcesPath);
  // console.log('\n[AUTH]', 'TOKENS_FILE=', path.join(app.getPath('userData'), 'google-oauth.enc'));

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  //TODO this is got to change
  // App close behavior
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
