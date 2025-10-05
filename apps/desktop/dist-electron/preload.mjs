"use strict";
const electron = require("electron");
const PyListeners = /* @__PURE__ */ new Set();
electron.ipcRenderer.on("py:event", (_e, data) => {
  for (const fn of PyListeners) fn(data);
});
console.log("[preload] running:", "index.html");
electron.contextBridge.exposeInMainWorld("pybridge", {
  sendToPython(payload) {
    return electron.ipcRenderer.invoke("py:send", payload);
  },
  onPythonEvent(listener) {
    PyListeners.add(listener);
    return () => PyListeners.delete(listener);
  },
  onPythonStderr(cb) {
    const handler = (__e, chunk) => cb(chunk);
    electron.ipcRenderer.on("py:stderr", handler);
    return () => electron.ipcRenderer.off("py:stderr", handler);
  },
  ping: () => electron.ipcRenderer.invoke("ping")
});
