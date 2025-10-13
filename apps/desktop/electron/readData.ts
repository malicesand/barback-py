import { app, ipcMain } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

ipcMain.handle('read-schedules', async () => {
  const base = app.isPackaged ? process.resourcesPath : process.cwd();
  const dir = path.join(base, 'resources', 'schedules');
  const files = await fs.readdir(dir).catch(() => []);
  return files;
});