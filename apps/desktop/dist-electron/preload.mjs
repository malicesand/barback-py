"use strict";
const electron = require("electron");
const PyListeners = /* @__PURE__ */ new Set();
electron.ipcRenderer.on("py:event", (_e, data) => {
  for (const fn of PyListeners) fn(data);
});
electron.contextBridge.exposeInMainWorld("pybridge", {
  sendToPython(payload) {
    return electron.ipcRenderer.invoke("py:send", payload);
  },
  onPythonEvent(listener) {
    PyListeners.add(listener);
    return () => PyListeners.delete(listener);
  },
  onPythonStderr(cb) {
    const handler = (_e, chunk) => {
      try {
        cb(String(chunk));
      } catch (err) {
        console.error("[py:stderr cb error", err);
      }
    };
    electron.ipcRenderer.on("py:stderr", handler);
    return () => electron.ipcRenderer.off("py:stderr", handler);
  },
  ping: () => electron.ipcRenderer.invoke("ping")
});
electron.contextBridge.exposeInMainWorld("gcal", {
  googleConnectAndOpenUpload: () => electron.ipcRenderer.invoke("google:connectAndOpenUpload"),
  listCalendars: () => electron.ipcRenderer.invoke("google:listCalendars"),
  fetchEvents: (opts) => electron.ipcRenderer.invoke("google:fetchEvents", opts),
  exportCalendarJson: (opts) => electron.ipcRenderer.invoke("google:exportCalendarJson", opts),
  exportMultipleCalendarsJson: (opts) => electron.ipcRenderer.invoke("google:exportMultipleCalendarsJson", opts)
});
electron.contextBridge.exposeInMainWorld("logs", {
  onMainLog(cb) {
    const handler = (_e, msg) => cb(msg);
    electron.ipcRenderer.on("main:log", handler);
    return () => electron.ipcRenderer.off("main:log", handler);
  }
});
electron.contextBridge.exposeInMainWorld("data", {
  readSchedules: () => electron.ipcRenderer.invoke("read-schedules")
});
