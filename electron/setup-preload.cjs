const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("maildeskSetup", {
  save: (settings) => ipcRenderer.invoke("maildesk:setup-save", settings),
  cancel: () => ipcRenderer.invoke("maildesk:setup-cancel"),
});
