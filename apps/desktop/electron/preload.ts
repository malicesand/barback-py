import { contextBridge, ipcRenderer } from 'electron';
//TODO learn about context bridge and global variables
contextBridge.exposeInMainWorld('barback', {
  ping: () => ipcRenderer.invoke('ping'),
});
