import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

type PyListener = (event: unknown) => void;

const PyListeners = new Set<PyListener>();

ipcRenderer.on('py:event', (_e: IpcRendererEvent, data: unknown) => {
  for (const fn of PyListeners) fn(data);
})
// ------------------------- PyBridge ------------------------- //
contextBridge.exposeInMainWorld('pybridge', {
  sendToPython(payload: unknown) {
    return ipcRenderer.invoke('py:send', payload);
  },
  onPythonEvent(listener: PyListener) {
    PyListeners.add(listener);
    return () => PyListeners.delete(listener); // unsubscribe function
  },
  onPythonStderr(cb: (chunk: string) => void) {
    const handler = (_e: IpcRendererEvent, chunk: string) => {
      try { cb(String(chunk)); } catch (err) { console.error('[py:stderr cb error', err); }
    };
    ipcRenderer.on('py:stderr', handler);
    return () => ipcRenderer.off('py:stderr', handler);
  },
  ping: () => ipcRenderer.invoke('ping'),
});
// ------------------------- Google ------------------------- //
contextBridge.exposeInMainWorld('gcal', {
  googleConnectAndOpenUpload: () => ipcRenderer.invoke('google:connectAndOpenUpload'),
  listCalendars: () => ipcRenderer.invoke('google:listCalendars'),
  fetchEvents: (opts: any) => ipcRenderer.invoke('google:fetchEvents', opts),
  exportCalendarJson: (opts: any) => ipcRenderer.invoke('google:exportCalendarJson', opts),
  exportMultipleCalendarsJson: (opts: any) => ipcRenderer.invoke('google:exportMultipleCalendarsJson', opts),
});

// ------------------------- Logs ------------------------- //
contextBridge.exposeInMainWorld('logs', {
  onMainLog(cb: (msg: { level: string; args: any[] }) => void) {
    const handler = (_e: any, msg: any) => cb(msg);
    ipcRenderer.on('main:log', handler);
    return () => ipcRenderer.off('main:log', handler);
  },
});

// ------------------------- Data ------------------------- //
contextBridge.exposeInMainWorld('data', {
  readSchedules: () => ipcRenderer.invoke('read-schedules')
});