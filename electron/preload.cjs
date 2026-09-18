const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("maildesk", {
  isElectron: true,
  showMailContextMenu: (payload) => ipcRenderer.invoke("maildesk:context-menu", payload),
  pickAttachments: () => ipcRenderer.invoke("maildesk:pick-attachments"),
  printDocument: (payload) => ipcRenderer.invoke("maildesk:print-document", payload),
  exportPdf: (payload) => ipcRenderer.invoke("maildesk:export-pdf", payload),
  exportEml: (payload) => ipcRenderer.invoke("maildesk:export-eml", payload),
  getSettings: () => ipcRenderer.invoke("maildesk:get-settings"),
  saveSettings: (settings) => ipcRenderer.invoke("maildesk:save-settings", settings),
  initializeSupabase: (settings) => ipcRenderer.invoke("maildesk:supabase-initialize", settings),
  notifyNewMail: (payload) => ipcRenderer.invoke("maildesk:notify-new-mail", payload),
  getActiveDraft: () => ipcRenderer.invoke("maildesk:draft-get"),
  saveActiveDraft: (draft) => ipcRenderer.invoke("maildesk:draft-save", draft),
  deleteActiveDraft: () => ipcRenderer.invoke("maildesk:draft-delete"),
  listDrafts: () => ipcRenderer.invoke("maildesk:drafts-list"),
  getDraft: (id) => ipcRenderer.invoke("maildesk:draft-get-by-id", id),
  saveDraft: (draft) => ipcRenderer.invoke("maildesk:draft-save-by-id", draft),
  deleteDraft: (id) => ipcRenderer.invoke("maildesk:draft-delete-by-id", id),
  getOutbox: () => ipcRenderer.invoke("maildesk:outbox-list"),
  enqueueOutbox: (payload) => ipcRenderer.invoke("maildesk:outbox-enqueue", payload),
  deleteOutbox: (id) => ipcRenderer.invoke("maildesk:outbox-delete", id),
  retryOutbox: (id) => ipcRenderer.invoke("maildesk:outbox-retry", id),
  processOutbox: () => ipcRenderer.invoke("maildesk:outbox-process"),
  listContacts: (limit = 500) => ipcRenderer.invoke("maildesk:contacts-list", limit),
  searchContacts: (query, limit = 8) => ipcRenderer.invoke("maildesk:contacts-search", query, limit),
  saveContact: (contact) => ipcRenderer.invoke("maildesk:contact-save", contact),
  deleteContact: (email) => ipcRenderer.invoke("maildesk:contact-delete", email),
  listBlockedSenders: () => ipcRenderer.invoke("maildesk:blocked-list"),
  blockSender: (from) => ipcRenderer.invoke("maildesk:blocked-add", from),
  unblockSender: (email) => ipcRenderer.invoke("maildesk:blocked-remove", email),
  listCustomFolders: () => ipcRenderer.invoke("maildesk:folders-list"),
  saveCustomFolder: (folder) => ipcRenderer.invoke("maildesk:folder-save", folder),
  reorderCustomFolders: (ids) => ipcRenderer.invoke("maildesk:folders-reorder", ids),
  deleteCustomFolder: (id) => ipcRenderer.invoke("maildesk:folder-delete", id),
  listRules: () => ipcRenderer.invoke("maildesk:rules-list"),
  saveRule: (rule) => ipcRenderer.invoke("maildesk:rule-save", rule),
  deleteRule: (id) => ipcRenderer.invoke("maildesk:rule-delete", id),
  runRules: () => ipcRenderer.invoke("maildesk:rules-run"),
  listTemplates: () => ipcRenderer.invoke("maildesk:templates-list"),
  saveTemplate: (template) => ipcRenderer.invoke("maildesk:template-save", template),
  deleteTemplate: (id) => ipcRenderer.invoke("maildesk:template-delete", id),
  listCalendarEvents: (range = {}) => ipcRenderer.invoke("maildesk:calendar-list", range),
  saveCalendarEvent: (event) => ipcRenderer.invoke("maildesk:calendar-save", event),
  deleteCalendarEvent: (id) => ipcRenderer.invoke("maildesk:calendar-delete", id),
  importCalendarIcs: () => ipcRenderer.invoke("maildesk:calendar-import-ics"),
  exportCalendarIcs: () => ipcRenderer.invoke("maildesk:calendar-export-ics"),
  openMessageWindow: (id) => ipcRenderer.invoke("maildesk:window-open-message", id),
  checkForUpdates: () => ipcRenderer.invoke("maildesk:update-check"),
  installPendingUpdate: () => ipcRenderer.invoke("maildesk:update-install"),
  exportBackup: () => ipcRenderer.invoke("maildesk:backup-export"),
  restoreBackup: () => ipcRenderer.invoke("maildesk:backup-restore"),
  openDataFolder: () => ipcRenderer.invoke("maildesk:data-folder-open"),
  getAppInfo: () => ipcRenderer.invoke("maildesk:app-info"),
  getWindowsIntegration: () => ipcRenderer.invoke("maildesk:windows-integration-get"),
  setWindowsStartup: (enabled) => ipcRenderer.invoke("maildesk:windows-startup-set", enabled),
  setMailtoHandler: (enabled) => ipcRenderer.invoke("maildesk:mailto-set", enabled),
  setUnreadCount: (count) => ipcRenderer.invoke("maildesk:unread-count", count),
  rendererReady: () => ipcRenderer.invoke("maildesk:renderer-ready"),
  getLocalSnapshot: () => ipcRenderer.invoke("maildesk:db-snapshot"),
  searchLocalMail: (query, limit = 100) => ipcRenderer.invoke("maildesk:db-search", query, limit),
  getLocalMail: (id) => ipcRenderer.invoke("maildesk:db-get", id),
  cacheMailLists: (payload) => ipcRenderer.invoke("maildesk:db-cache-list", payload),
  cacheMailDetail: (payload) => ipcRenderer.invoke("maildesk:db-cache-detail", payload),
  updateLocalMailState: (payload) => ipcRenderer.invoke("maildesk:db-update-state", payload),
  syncNow: () => ipcRenderer.invoke("maildesk:sync-now"),
  onMailContextAction: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("maildesk:context-action", listener);
    return () => ipcRenderer.removeListener("maildesk:context-action", listener);
  },
  onAppAction: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("maildesk:app-action", listener);
    return () => ipcRenderer.removeListener("maildesk:app-action", listener);
  },
  onOutboxUpdated: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("maildesk:outbox-updated", listener);
    return () => ipcRenderer.removeListener("maildesk:outbox-updated", listener);
  },
});
