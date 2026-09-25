const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("maildeskSetup", {
  restore: (settings) => ipcRenderer.invoke("maildesk:setup-restore", settings),
  save: (settings) => ipcRenderer.invoke("maildesk:setup-save", settings),
  cancel: () => ipcRenderer.invoke("maildesk:setup-cancel"),
});
