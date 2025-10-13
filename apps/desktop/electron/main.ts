import { app, BrowserWindow, ipcMain, shell, safeStorage } from 'electron';
import * as path from 'node:path';
import { spawn } from 'child_process';
import { fileURLToPath } from "node:url";
import { google, calendar_v3 } from 'googleapis';
import fs from 'node:fs/promises';
import fssync from 'fs';
import http from 'http';
import { URL } from 'url';
import readline from 'node:readline';

let win: BrowserWindow | null = null;
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const APP_NAME = app.isPackaged 
  ? app.setName('Barback-Ingest-Companion') 
  : app.setName('Barback-Dev-5')
// -------------- Print Logs in Renderer ------------- //
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

// ------------------ Preload Debug ------------------ //
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
// --------------------- Paths  ---------------------- //
const isPackaged = app.isPackaged;

// __dirname here points to dist-electron at runtime
const DEV_ROOT = path.resolve(__dirname, '../../..'); // repo root (…/barback-py)
const DESKTOP_ROOT = path.join(DEV_ROOT, 'apps', 'desktop');

const RES = isPackaged ? process.resourcesPath : DESKTOP_ROOT; // base for resources/vendor in dev

// Python project (your scripts)
const PY_PROJECT = isPackaged
  ? path.join(RES, 'py-project')
  : path.join(DEV_ROOT, 'py-project');

// Credentials/resources (oauth_client.json etc.)
const RESOURCES_DIR = isPackaged
  ? path.join(RES, 'resources')
  : path.join(DESKTOP_ROOT, 'resources');

// Bundled Python.framework (we will spawn this directly)
const PY_FRAME = isPackaged
  ? path.join(RES, 'python-framework', 'Python.framework', 'Versions', '3.13')
  : path.join(DESKTOP_ROOT, 'vendor', 'python-framework', 'Python.framework', 'Versions', '3.13');

const PYTHON_BIN = path.join(PY_FRAME, 'bin', 'python3.13');

// ExifTool
const EXIFTOOL_BIN = isPackaged
  ? path.join(RES, 'exiftool', 'exiftool')
  : 'exiftool';

// Data dir (schedule JSONs)
const DATA_DIR = path.join(PY_PROJECT, 'data');
/* // --------------------- Paths  ---------------------- // ! OLD
const isPackaged = app.isPackaged;
const DEV_ROOT = path.resolve(__dirname, '../../..'); // dist-electron/main -> repo root 
const RUNTIME_BASE = app.isPackaged 
  ? process.resourcesPath               // Barback.app/Contents/Resources
  : DEV_ROOT;                           //Root in dev 

const PYPROJ = path.join(RUNTIME_BASE, 'py-project'); // Production and Dev Python Script Directory 
const RESOURCES_DIR = app.isPackaged //New
  ? path.join(RUNTIME_BASE, 'resources') // Barback.app/Contents/Resources/resources
  : path.join(process.cwd(), 'resources'); // apps/desktop/resource/credentials 

  // const PY_FRAME = path.join(RESOURCES_DIR, "python-framework", "Python.framework", "Versions", "3.13");
const PY_FRAME = isPackaged
  ? path.join(RES, "python-framework", "Python.framework", "Versions", "3.13")
  : path.join(RES, "vendor", "python-framework", "Python.framework", "Versions", "3.13");
const PYTHON_BIN = path.join(PY_FRAME, "bin", "python3.13");
const DATA_DIR = path.join(PYPROJ, 'data'); // schedule JSONs and TSV
const child = spawn(PYTHON_BIN, [path.join(PYPROJ, "watch_card.py")], {
  stdio: "pipe",
  env: {
    ...process.env,
    PYTHONHOME: PY_FRAME,
    PYTHONPATH: path.join(PY_FRAME, "lib", "python3.13")
  }
});

// const RES = process.resourcesPath;
const PY_VENV = path.join(RESOURCES_DIR, "py-venv");
// const PYTHON_BIN = path.join(PY_VENV, "bin", "python3"); */
// ------------------- Read Data  ----------------- //

ipcMain.handle('read-schedules', async () => {
  const files = await fs.readdir(DATA_DIR).catch(() => []);
  console.log(`[main] Data Files ${files}`)
  return files;
});





// ------------------ Google Login ------------------- //
const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];
const CREDS_PATH = path.join(RESOURCES_DIR, 'credentials', 'oauth_client.json'); // Cloud Console Client Creds

// TODO AUTH //
const USERDATA_DIR = app.getPath('userData'); //dev= App_NAME/ : prod=
const TOKEN_PATH = path.join(USERDATA_DIR, 'google', 'token.json'); //dev=APP_NAME/google/token.json 

async function ensureTokenDir() { 
  await fs.mkdir(path.dirname(TOKEN_PATH), { recursive: true }).catch(() => {});
}
const TOKENS_FILE = path.join(app.getPath('userData'), 'google-oauth.enc') //dev=APP_NAME/google-oauth.enc

// Load Desktop OAuth client (client_id, client_secret, redirect_uris)
async function loadClientJSON() { //? Refactor
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

// ------------------- Cal Connect -------------------- //
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
  const prodDir = DATA_DIR;
  const dir = isDev() ? devDir : prodDir;
  if (!fssync.existsSync(dir)) fssync.mkdirSync(dir, { recursive: true });
  return dir;
} 
//? maybe don't need getDataDir() bc prodDir = devDir
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
  //  console.log('\n[AUTH] entering getAuthorizedClient');
  const { installed } = await loadClientJSON();
  const cached = await loadTokens();
  
   console.log('[AUTH] cached?', !!cached);
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
  ipcMain.handle('google:connectAndOpenUpload', async () => {
    try {
      // make sure packaged creds exist
      await fs.access(CREDS_PATH);
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
  
  /** Export ONE calendar to a JSON file shaped*/
  ipcMain.handle('google:exportCalendarJson', async (_evt, opts: {
    calendarId: string;
    timeMin: string; // e.g., '2025-07-19T00:00:00-05:00'
    timeMax: string;
    suggestedFilename?: string; // e.g., 'schedule_jkb.json'
  }) => {
    
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
}

// ------------------ Electron Windows  --------------- //

let py: import('child_process').ChildProcessWithoutNullStreams | null = null;
// let win: BrowserWindow | null = null; //TODO delete these
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);
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

// ----------------- Python Launch Code --------------- 
// 
function spawnPython() {
  const scriptPath = path.join(PY_PROJECT, 'watch_card.py');

  console.log('\n[DEV?]', !isPackaged);
  console.log('[PYTHON]', PYTHON_BIN);
  console.log('[SCRIPT]', scriptPath, 'exists?', fssync.existsSync(scriptPath));

  const env = {
    ...process.env,
    // let Python know its home/libs
    PYTHONHOME: PY_FRAME,
    PYTHONPATH: path.join(PY_FRAME, 'lib', 'python3.13'),
    // app paths your script might need
    APP_RESOURCES: RESOURCES_DIR,
    PY_PROJECT: PY_PROJECT,
    DATA_DIR,
    USERDATA_DIR,
    EXIFTOOL_PATH: EXIFTOOL_BIN,
    // conservative PATH so sub-processes can find basic tools in dev
    PATH: [
      path.dirname(PYTHON_BIN),
      '/usr/bin','/bin','/usr/sbin','/sbin',
      '/usr/local/bin','/opt/homebrew/bin'
    ].join(':'),
  };

  py = spawn(PYTHON_BIN, [scriptPath], { stdio: ['pipe','pipe','pipe'], env });

  py.on('error', (err) => {
    console.error('[PY ERROR]', err);
    if (win) win.webContents.send('py:stderr', String(err));
  });

  const rl = readline.createInterface({ input: py.stdout });
  rl.on('line', (line) => {
    try {
      const msg = JSON.parse(line);
      win?.webContents.send('py:event', msg);
    } catch {
      win?.webContents.send('py:event', { type: 'log', raw: line });
    }
  });

  py.stderr.setEncoding('utf8');
  let errBuf = '';
  py.stderr.on('data', (chunk: string) => {
    errBuf += chunk;
    for (;;) {
      const nl = errBuf.indexOf('\n');
      if (nl < 0) break;
      const line = errBuf.slice(0, nl).replace(/\r$/, '');
      errBuf = errBuf.slice(nl + 1);
      win?.webContents.send('py:stderr', line);
    }
  });

  py.on('exit', (code, signal) => {
    console.warn(`[PY EXIT] code=${code} signal=${signal}`);
    win?.webContents.send('py:event', { type: 'py_exit', code, signal });
    py = null;
  });

  ipcMain.handle('py:send', (_evt, payload: unknown) => {
    if (!py) throw new Error('Python not running');
    py.stdin.write(JSON.stringify(payload) + '\n');
    return true;
  });

  ipcMain.handle('ping', () => 'pong');
}


//!OLD
/* function spawnPython() {

  const python = app.isPackaged 
    ? path.join(RUNTIME_BASE, 'py-venv', 'bin', 'python3')   // embedded venv
    : (process.platform === 'win32' ? 'python' : 'python3'); // dev

  const scriptPath = path.join(PYPROJ, 'watch_card.py'); 
  
  const exiftoolPath = app.isPackaged 
    ? path.join(RUNTIME_BASE, 'exiftool', 'exiftool')        // bundled
    : 'exiftool';                                            // dev PATH/Homebrew

  //? quick sanity logs
  console.log('\n[DEV?]', !app.isPackaged);
  console.log('[PYTHON]', python);
  console.log('[SCRIPT]', scriptPath, 'exists?', fssync.existsSync(scriptPath));
  
  // Pass down PATHS to Python
  const env = { //*New
    ...process.env,
    APP_RESOURCES: RESOURCES_DIR, //? why change name
    PY_PROJECT: PYPROJ,           //? why change name
    DATA_DIR, 
    USERDATA_DIR, 
    EXIFTOOL_PATH: exiftoolPath,  //? why change name
    PATH: [
      app.isPackaged ? path.dirname(python) : '',
      '/usr/bin','/bin','/usr/sbin','/sbin',
      '/usr/local/bin','/opt/homebrew/bin'
    ].filter(Boolean).join(':'),
  };

  //! AUTH checks
  console.log('\n[AUTH] Dev?', !app.isPackaged); 
  console.log(`   User Data Dir: ${USERDATA_DIR}`) // Dev: /Users/maryalice/Library/Application Support/Barback dev beta 1
  console.log(`   Token Path: ${TOKEN_PATH}`) // Dev: 
  console.log(`   Tokens File: ${TOKENS_FILE}`)

  // py = spawn(pythonCmd, [scriptPath], { stdio: ['pipe', 'pipe', 'pipe'], }); //?Old
  py = spawn(python, [scriptPath], { stdio: ['pipe','pipe','pipe'], env }); //* New

  // Diagnostics
  py.on('error', (err) => {
    console.error('[PY ERROR]', err);
    if (win) win.webContents.send('py:stderr', String(err));
  });

  /* set python logs to print to dev console 
  const rl = readline.createInterface({ input: py.stdout }); rl.on('line', (line) => {
    try {
      const msg = JSON.parse(line); // Parse stdout as NDJSON
      if (win) win.webContents.send('py:event', msg);
    } catch {
      if (win) win.webContents.send('py:event', { type: 'error', error: 'invalid_json', raw: line });
    }
  })
  
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

}; */

// -------------------- When Ready -------------------- //
app.whenReady().then(() => {
  registerGoogleIpc();
  spawnPython();
  createWindow();

  console.log('\n[APP]', APP_NAME);
  // console.log('[APP]', 'data dir=', DATA_DIR);
  // console.log('[APP]', 'userData=', app.getPath('userData'));
  // console.log('[APP]', 'resourcesPath=', process.resourcesPath);
  // console.log('\n[AUTH]', 'TOKENS_FILE=', path.join(app.getPath('userData'), 'google-oauth.enc'));

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  //TODO this is got to change
  // App close behavior
  // app.on('window-all-closed', () => {
  //   if (process.platform !== 'darwin') app.quit();
// });
