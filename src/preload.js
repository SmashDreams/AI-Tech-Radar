const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("techRadar", {
  getConfig: () => ipcRenderer.invoke("config:get"),
  saveConfig: (config) => ipcRenderer.invoke("config:save", config),
  refresh: (options) => ipcRenderer.invoke("radar:refresh", options)
});
