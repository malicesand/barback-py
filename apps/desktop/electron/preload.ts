import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

type PyListener = (event: unknown) => void;

const PyListeners = new Set<PyListener>();

ipcRenderer.on('py:event', (_e: IpcRendererEvent, data: unknown) => {
  for (const fn of PyListeners) fn(data);
})

console.log('[preload] running:', 'index.html');

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
