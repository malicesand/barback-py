import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from "node:url";

// Recreate __filename and __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // if (process.env.VITE_DEV_SERVER_URL) {
  //   win.loadURL(process.env.VITE_DEV_SERVER_URL);
  // } else {
  //   win.loadFile(path.join(__dirname, '../index.html'));
// }
win.loadURL(process.env.VITE_DEV_SERVER_URL!);
}

app.whenReady().then(createWindow);
