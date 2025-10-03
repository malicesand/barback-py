"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("barback", {
  ping: () => electron.ipcRenderer.invoke("ping")
});
