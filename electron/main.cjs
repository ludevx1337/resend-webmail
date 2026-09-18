const { app, BrowserWindow, dialog, ipcMain, shell, Menu, Notification, Tray } = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { buildApplicationMenu, popupMailContextMenu } = require("./menu.cjs");
const {
  applyStoredSettings,
  effectiveSettings,
  hasConfiguredAccount,
  publicSettings,
  saveStoredSettings,
} = require("./settings.cjs");
const {
  blockSender,
  closeDatabase,
  createDatabaseBackup,
  databasePath,
  deleteActiveDraft,
  deleteContact,
  deleteCustomFolder,
  deleteDraft,
  deleteOutbox,
  deleteRule,
  enqueueOutbox,
  getActiveDraft,
  getDraft,
  getDueOutbox,
  getLocalMail,
  getNextOutboxAttemptAt,
  getSnapshot,
  listBlockedSenders,
  listContacts,
  listCustomFolders,
  listDrafts,
  listOutbox,
  listRules,
  markOutboxFailed,
  markOutboxSending,
  resetSendingOutbox,
  restoreDatabaseBackup,
  retryOutbox,
  runRulesOnInbox,
  saveActiveDraft,
  saveContact,
  saveCustomFolder,
  saveDraft,
  saveRule,
  searchContacts,
  searchLocalMessages,
  unblockSender,
  updateState,
  upsertMail,
  upsertMany,
} = require("./db.cjs");
const { syncWithSupabase } = require("./sync.cjs");
const { initializeSupabase } = require("./supabase-provision.cjs");

let mainWindow = null;
let setupWindow = null;
let nextServer = null;
let nextApplication = null;
let tray = null;
let applicationUrl = null;
let isQuitting = false;
let setupResolver = null;
let outboxTimer = null;
let outboxWakeTimer = null;
let outboxProcessing = false;
let pendingMailto = null;

if (process.platform === "win32") {
  app.setAppUserModelId("com.devlow.maildesk");
}
app.setName("MailDesk");

function parseMailtoUrl(value) {
  const raw = String(value || "").trim();
  if (!/^mailto:/i.test(raw)) return null;

  const body = raw.slice(7);
  const queryIndex = body.indexOf("?");
  const addressPart = queryIndex >= 0 ? body.slice(0, queryIndex) : body;
  const query = queryIndex >= 0 ? body.slice(queryIndex + 1) : "";
  const params = new URLSearchParams(query);
  const decode = (input) => {
    try { return decodeURIComponent(String(input || "")); } catch { return String(input || ""); }
  };

  return {
    to: decode(addressPart),
    cc: params.get("cc") || "",
    bcc: params.get("bcc") || "",
    subject: params.get("subject") || "",
    text: params.get("body") || "",
  };
}

function findMailtoArgument(args = []) {
  const target = args.find((arg) => /^mailto:/i.test(String(arg || "").trim()));
  return target ? parseMailtoUrl(target) : null;
}

function dispatchMailto(payload) {
  if (!payload) return;
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isLoading()) {
    pendingMailto = payload;
    return;
  }
  pendingMailto = null;
  showMainWindow();
  mainWindow.webContents.send("maildesk:app-action", { action: "compose-mailto", ...payload });
}

function flushPendingMailto() {
  if (!pendingMailto) return;
  const payload = pendingMailto;
  pendingMailto = null;
  dispatchMailto(payload);
}

function protocolClientArgs() {
  if (process.defaultApp && process.argv[1]) {
    return { executable: process.execPath, args: [path.resolve(process.argv[1])] };
  }
  return { executable: undefined, args: undefined };
}

function isMailtoHandler() {
  const options = protocolClientArgs();
  return options.executable
    ? app.isDefaultProtocolClient("mailto", options.executable, options.args)
    : app.isDefaultProtocolClient("mailto");
}

function setMailtoHandler(enabled) {
  const options = protocolClientArgs();
  if (enabled) {
    return options.executable
      ? app.setAsDefaultProtocolClient("mailto", options.executable, options.args)
      : app.setAsDefaultProtocolClient("mailto");
  }
  return options.executable
    ? app.removeAsDefaultProtocolClient("mailto", options.executable, options.args)
    : app.removeAsDefaultProtocolClient("mailto");
}

function windowsIntegrationStatus() {
  return {
    isPackaged: app.isPackaged,
    openAtLogin: app.isPackaged ? Boolean(app.getLoginItemSettings().openAtLogin) : false,
    mailtoRegistered: isMailtoHandler(),
  };
}

function setOpenAtLogin(enabled) {
  if (!app.isPackaged) {
    return { ...windowsIntegrationStatus(), ok: false, message: "Disponible dans la version Windows installée." };
  }
  app.setLoginItemSettings({
    openAtLogin: Boolean(enabled),
    path: process.execPath,
  });
  return { ...windowsIntegrationStatus(), ok: true };
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    if (applicationUrl) createWindow(applicationUrl);
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  if (tray) return;
  const iconPath = path.join(app.getAppPath(), "public", "maildesk.ico");
  if (!fs.existsSync(iconPath)) return;

  tray = new Tray(iconPath);
  tray.setToolTip("MailDesk");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Ouvrir MailDesk", click: showMainWindow },
    { label: "Nouveau message", click: () => {
      showMainWindow();
      mainWindow?.webContents.send("maildesk:app-action", { action: "compose" });
    } },
    { label: "Actualiser", click: () => mainWindow?.webContents.send("maildesk:app-action", { action: "refresh" }) },
    { type: "separator" },
    { label: "Quitter", click: () => {
      isQuitting = true;
      app.quit();
    } },
  ]));
  tray.on("double-click", showMainWindow);
}

function showNewMailNotification(payload) {
  if (!Notification.isSupported()) return false;
  const count = Math.max(1, Number(payload?.count) || 1);
  const notification = new Notification({
    title: count > 1 ? `${count} nouveaux messages` : (payload?.title || "Nouveau message"),
    body: count > 1 ? "De nouveaux messages sont arrivés dans MailDesk." : (payload?.body || "Vous avez reçu un nouveau message."),
    silent: false,
  });
  notification.on("click", showMainWindow);
  notification.show();
  return true;
}

function showOutboxNotification(title, body) {
  if (!Notification.isSupported()) return;
  const notification = new Notification({ title, body, silent: false });
  notification.on("click", showMainWindow);
  notification.show();
}

function notifyOutboxUpdated() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("maildesk:outbox-updated", listOutbox());
}

function updateUnreadCount(count) {
  const unread = Math.max(0, Number(count) || 0);
  if (tray) {
    tray.setToolTip(unread > 0 ? `MailDesk — ${unread} non lu${unread > 1 ? "s" : ""}` : "MailDesk");
  }
  return unread;
}

function scheduleNextOutboxWake() {
  if (outboxWakeTimer) clearTimeout(outboxWakeTimer);
  outboxWakeTimer = null;

  const nextAttemptAt = getNextOutboxAttemptAt();
  if (!nextAttemptAt) return;

  const delay = Math.max(0, new Date(nextAttemptAt).getTime() - Date.now()) + 100;
  outboxWakeTimer = setTimeout(() => {
    outboxWakeTimer = null;
    void processOutbox();
  }, Math.min(delay, 2_147_000_000));
}

async function processOutbox() {
  if (outboxProcessing || !applicationUrl || isQuitting) return listOutbox();
  outboxProcessing = true;

  try {
    const due = getDueOutbox(10);
    for (const item of due) {
      markOutboxSending(item.id);
      notifyOutboxUpdated();

      try {
        const response = await fetch(`${applicationUrl}/api/mail/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            from: item.from,
            to: item.to,
            cc: item.cc,
            bcc: item.bcc,
            subject: item.subject,
            text: item.text,
            html: item.html,
            replyToMessageId: item.replyToMessageId,
            replyReferences: item.replyReferences,
            attachments: item.attachments,
            idempotencyKey: item.idempotencyKey,
          }),
        });
        const result = await response.json().catch(() => ({}));

        if (response.ok) {
          if (result?.email?.id) {
            upsertMail({
              id: result.email.id,
              created_at: new Date().toISOString(),
              from: item.from || undefined,
              to: String(item.to || "").split(/[;,]/).map((value) => value.trim()).filter(Boolean),
              cc: String(item.cc || "").split(/[;,]/).map((value) => value.trim()).filter(Boolean),
              bcc: String(item.bcc || "").split(/[;,]/).map((value) => value.trim()).filter(Boolean),
              subject: item.subject || "(Sans objet)",
              html: item.html || null,
              text: item.text || null,
              in_reply_to: item.replyToMessageId,
              references: item.replyReferences || [],
            }, "outbound");
          }
          deleteOutbox(item.id);
          showOutboxNotification("Message envoyé", item.subject || "Votre message en attente a été envoyé.");
          mainWindow?.webContents.send("maildesk:app-action", { action: "outbox-sent" });
          continue;
        }

        const detail = result?.error || `Erreur HTTP ${response.status}`;
        const retryable = response.status >= 500 || response.status === 408 || response.status === 429;
        const baseDelay = retryable
          ? Math.min(30 * 60, 30 * Math.max(1, 2 ** Number(item.attempts || 0)))
          : 24 * 60 * 60;
        markOutboxFailed(item.id, detail, baseDelay);
      } catch (error) {
        const delay = Math.min(30 * 60, 30 * Math.max(1, 2 ** Number(item.attempts || 0)));
        markOutboxFailed(item.id, error instanceof Error ? error.message : String(error), delay);
      }

      notifyOutboxUpdated();
    }
  } finally {
    outboxProcessing = false;
  }

  notifyOutboxUpdated();
  scheduleNextOutboxWake();
  return listOutbox();
}

async function pickAttachments() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Ajouter des pièces jointes",
    properties: ["openFile", "multiSelections"],
  });
  if (result.canceled) return [];

  const files = [];
  let total = 0;
  for (const filePath of result.filePaths) {
    const stat = await fs.promises.stat(filePath);
    if (stat.size > 20 * 1024 * 1024) throw new Error(`${path.basename(filePath)} dépasse 20 Mo.`);
    total += stat.size;
    if (total > 35 * 1024 * 1024) throw new Error("Les pièces jointes dépassent 35 Mo au total.");
    const buffer = await fs.promises.readFile(filePath);
    files.push({ name: path.basename(filePath), size: stat.size, content: buffer.toString("base64") });
  }
  return files;
}

function safeDocumentName(value, fallback = "MailDesk") {
  const cleaned = String(value || "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return cleaned || fallback;
}

async function withDocumentWindow(html, operation) {
  const tempPath = path.join(app.getPath("temp"), `maildesk-document-${process.pid}-${Date.now()}.html`);
  await fs.promises.writeFile(tempPath, String(html || ""), "utf8");

  const printWindow = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      javascript: false,
      webSecurity: true,
    },
  });
  printWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  try {
    await printWindow.loadFile(tempPath);
    return await operation(printWindow);
  } finally {
    if (!printWindow.isDestroyed()) printWindow.destroy();
    await fs.promises.unlink(tempPath).catch(() => {});
  }
}

async function printHtmlDocument(payload = {}) {
  return await withDocumentWindow(payload.html, async (printWindow) => {
    return await new Promise((resolve) => {
      printWindow.webContents.print(
        { silent: false, printBackground: true },
        (success, failureReason) => resolve({
          ok: success,
          canceled: !success && /cancel/i.test(String(failureReason || "")),
          message: failureReason || undefined,
        }),
      );
    });
  });
}

async function exportPdfDocument(payload = {}) {
  const filename = safeDocumentName(payload.title, "MailDesk");
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Exporter en PDF",
    defaultPath: path.join(app.getPath("documents"), `${filename}.pdf`),
    filters: [{ name: "Document PDF", extensions: ["pdf"] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };

  const pdf = await withDocumentWindow(payload.html, (printWindow) => {
    return printWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4",
      preferCSSPageSize: true,
    });
  });
  await fs.promises.writeFile(result.filePath, pdf);
  return { ok: true, canceled: false, path: result.filePath };
}

function cleanHeader(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

function encodeHeader(value) {
  const raw = cleanHeader(value);
  if (!raw || /^[\x20-\x7E]*$/.test(raw)) return raw;
  return `=?UTF-8?B?${Buffer.from(raw, "utf8").toString("base64")}?=`;
}

function foldBase64(buffer) {
  return buffer.toString("base64").match(/.{1,76}/g)?.join("\r\n") || "";
}

async function buildEmlDocument(payload = {}) {
  const message = payload.message || {};
  const folder = payload.folder === "sent" ? "sent" : "inbox";
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  const html = String(message.html || "").trim();
  const text = String(message.text || "").trim();
  const bodyContentType = html ? 'text/html; charset="utf-8"' : 'text/plain; charset="utf-8"';
  const body = Buffer.from(html || text || " ", "utf8").toString("base64");
  const headers = [
    `From: ${cleanHeader(message.from)}`,
    `To: ${(message.to || []).map(cleanHeader).join(", ")}`,
    ...(message.cc?.length ? [`Cc: ${message.cc.map(cleanHeader).join(", ")}`] : []),
    `Subject: ${encodeHeader(message.subject || "(Sans objet)")}`,
    `Date: ${new Date(message.created_at || Date.now()).toUTCString()}`,
    ...(message.message_id ? [`Message-ID: ${cleanHeader(message.message_id)}`] : []),
    ...(message.in_reply_to ? [`In-Reply-To: ${cleanHeader(message.in_reply_to)}`] : []),
    ...(message.references?.length ? [`References: ${message.references.map(cleanHeader).join(" ")}`] : []),
    "MIME-Version: 1.0",
  ];

  if (!attachments.length) {
    return [
      ...headers,
      `Content-Type: ${bodyContentType}`,
      "Content-Transfer-Encoding: base64",
      "",
      body.match(/.{1,76}/g)?.join("\r\n") || body,
      "",
    ].join("\r\n");
  }

  const boundary = `----=_MailDesk_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const parts = [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    `Content-Type: ${bodyContentType}`,
    "Content-Transfer-Encoding: base64",
    "",
    body.match(/.{1,76}/g)?.join("\r\n") || body,
  ];

  for (const attachment of attachments) {
    if (!attachment?.id || !applicationUrl) continue;
    try {
      const response = await fetch(
        `${applicationUrl}/api/mail/${folder}/${encodeURIComponent(message.id)}/attachments/${encodeURIComponent(attachment.id)}`,
        { redirect: "follow" },
      );
      if (!response.ok) continue;
      const buffer = Buffer.from(await response.arrayBuffer());
      const filename = cleanHeader(attachment.filename || "attachment.bin").replace(/"/g, "'");
      const contentType = cleanHeader(attachment.content_type || "application/octet-stream");
      parts.push(
        `--${boundary}`,
        `Content-Type: ${contentType}; name="${filename}"`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename="${filename}"`,
        "",
        foldBase64(buffer),
      );
    } catch {
      // Keep the EML export usable even if one remote attachment cannot be fetched.
    }
  }

  parts.push(`--${boundary}--`, "");
  return parts.join("\r\n");
}

async function exportEmlDocument(payload = {}) {
  const message = payload.message || {};
  const filename = safeDocumentName(payload.title || message.subject, "message");
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Exporter le message EML",
    defaultPath: path.join(app.getPath("documents"), `${filename}.eml`),
    filters: [{ name: "Message EML", extensions: ["eml"] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  const content = await buildEmlDocument(payload);
  await fs.promises.writeFile(result.filePath, content, "utf8");
  return { ok: true, canceled: false, path: result.filePath };
}

function showFirstRunSetup() {
  return new Promise((resolve) => {
    setupResolver = resolve;
    setupWindow = new BrowserWindow({
      width: 690,
      height: 620,
      minWidth: 600,
      minHeight: 540,
      resizable: true,
      title: "Première configuration MailDesk",
      icon: path.join(app.getAppPath(), "public", "maildesk.ico"),
      backgroundColor: "#eef3f7",
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, "setup-preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });

    void setupWindow.loadFile(path.join(__dirname, "setup.html"));
    setupWindow.on("closed", () => {
      setupWindow = null;
      if (setupResolver) {
        const pending = setupResolver;
        setupResolver = null;
        pending(hasConfiguredAccount());
      }
    });
  });
}

async function startProductionServer() {
  const next = require("next");
  const root = app.getAppPath();
  nextApplication = next({ dev: false, dir: root });
  await nextApplication.prepare();
  const handle = nextApplication.getRequestHandler();
  nextServer = http.createServer((req, res) => handle(req, res));

  await new Promise((resolve, reject) => {
    nextServer.once("error", reject);
    nextServer.listen(0, "127.0.0.1", resolve);
  });

  const address = nextServer.address();
  if (!address || typeof address === "string") throw new Error("Port local MailDesk indisponible");
  return `http://127.0.0.1:${address.port}`;
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#f3f5f7",
    title: "MailDesk",
    icon: path.join(app.getAppPath(), "public", "maildesk.ico"),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  void mainWindow.loadURL(url);

  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^(https?:\/\/|mailto:)/i.test(target)) void shell.openExternal(target);
    return { action: "deny" };
  });

  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow?.hide();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

ipcMain.handle("maildesk:setup-save", (_event, input) => {
  try {
    saveStoredSettings(input);
    applyStoredSettings();
    if (setupResolver) {
      const pending = setupResolver;
      setupResolver = null;
      pending(true);
    }
    setupWindow?.close();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle("maildesk:setup-cancel", () => {
  setupWindow?.close();
  return true;
});

ipcMain.handle("maildesk:context-menu", (event, payload) => popupMailContextMenu(event, {
  ...payload,
  customFolders: listCustomFolders(),
}));
ipcMain.handle("maildesk:pick-attachments", pickAttachments);
ipcMain.handle("maildesk:print-document", (_event, payload) => printHtmlDocument(payload));
ipcMain.handle("maildesk:export-pdf", (_event, payload) => exportPdfDocument(payload));
ipcMain.handle("maildesk:export-eml", (_event, payload) => exportEmlDocument(payload));
ipcMain.handle("maildesk:notify-new-mail", (_event, payload) => showNewMailNotification(payload));
ipcMain.handle("maildesk:get-settings", () => ({
  ...publicSettings(),
  databasePath: databasePath(),
  isPackaged: app.isPackaged,
}));
ipcMain.handle("maildesk:save-settings", async (_event, input) => {
  let saved = saveStoredSettings(input);
  applyStoredSettings();

  let sync = { configured: false, ok: true, mode: "local-only", message: "Base locale active" };
  if (saved.supabaseUrl && saved.supabaseKey) {
    try {
      if (saved.supabaseManagementToken) {
        const initialized = await initializeSupabase(saved);
        if (!saved.supabaseProjectRef && initialized.projectRef) {
          saved = saveStoredSettings({ ...saved, supabaseProjectRef: initialized.projectRef });
          applyStoredSettings();
        }
        sync = initialized.sync;
      } else {
        sync = await syncWithSupabase(saved);
      }
    } catch (error) {
      sync = {
        configured: true,
        ok: false,
        mode: "local-only",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return { ...publicSettings(), sync, requiresDevRestart: !app.isPackaged };
});

ipcMain.handle("maildesk:supabase-initialize", async (_event, input) => {
  try {
    let saved = saveStoredSettings(input);
    applyStoredSettings();
    const result = await initializeSupabase(saved);
    if (!saved.supabaseProjectRef && result.projectRef) {
      saved = saveStoredSettings({ ...saved, supabaseProjectRef: result.projectRef });
      applyStoredSettings();
    }
    return { ...publicSettings(), ...result };
  } catch (error) {
    return {
      ...publicSettings(),
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
});

ipcMain.handle("maildesk:draft-get", () => getActiveDraft());
ipcMain.handle("maildesk:draft-save", (_event, draft) => saveActiveDraft(draft));
ipcMain.handle("maildesk:draft-delete", () => deleteActiveDraft());
ipcMain.handle("maildesk:drafts-list", () => listDrafts());
ipcMain.handle("maildesk:draft-get-by-id", (_event, id) => getDraft(id));
ipcMain.handle("maildesk:draft-save-by-id", (_event, draft) => saveDraft(draft));
ipcMain.handle("maildesk:draft-delete-by-id", (_event, id) => deleteDraft(id));

ipcMain.handle("maildesk:outbox-list", () => listOutbox());
ipcMain.handle("maildesk:outbox-enqueue", async (_event, payload) => {
  const item = enqueueOutbox(payload);
  notifyOutboxUpdated();
  void processOutbox();
  return item;
});
ipcMain.handle("maildesk:outbox-delete", (_event, id) => {
  const result = deleteOutbox(id);
  notifyOutboxUpdated();
  scheduleNextOutboxWake();
  return result;
});
ipcMain.handle("maildesk:outbox-retry", async (_event, id) => {
  retryOutbox(id);
  notifyOutboxUpdated();
  return await processOutbox();
});
ipcMain.handle("maildesk:outbox-process", () => processOutbox());

ipcMain.handle("maildesk:contacts-list", (_event, limit) => listContacts(limit));
ipcMain.handle("maildesk:contacts-search", (_event, query, limit) => searchContacts(query, limit));
ipcMain.handle("maildesk:contact-save", (_event, contact) => saveContact(contact));
ipcMain.handle("maildesk:contact-delete", (_event, email) => deleteContact(email));
ipcMain.handle("maildesk:blocked-list", () => listBlockedSenders());
ipcMain.handle("maildesk:blocked-add", (_event, from) => blockSender(from));
ipcMain.handle("maildesk:blocked-remove", (_event, email) => unblockSender(email));

ipcMain.handle("maildesk:folders-list", () => listCustomFolders());
ipcMain.handle("maildesk:folder-save", (_event, folder) => saveCustomFolder(folder));
ipcMain.handle("maildesk:folder-delete", (_event, id) => deleteCustomFolder(id));

ipcMain.handle("maildesk:rules-list", () => listRules());
ipcMain.handle("maildesk:rule-save", (_event, rule) => saveRule(rule));
ipcMain.handle("maildesk:rule-delete", (_event, id) => deleteRule(id));
ipcMain.handle("maildesk:rules-run", () => runRulesOnInbox());

ipcMain.handle("maildesk:db-snapshot", () => getSnapshot());
ipcMain.handle("maildesk:db-search", (_event, query, limit) => searchLocalMessages(query, limit));
ipcMain.handle("maildesk:db-get", (_event, id) => getLocalMail(id));
ipcMain.handle("maildesk:db-cache-list", (_event, payload) => {
  if (payload?.inbox) upsertMany(payload.inbox, "inbound");
  if (payload?.sent) upsertMany(payload.sent, "outbound");
  return getSnapshot();
});
ipcMain.handle("maildesk:db-cache-detail", (_event, payload) => {
  upsertMail(payload?.mail, payload?.direction === "outbound" ? "outbound" : "inbound");
  return getLocalMail(payload?.mail?.id);
});
ipcMain.handle("maildesk:db-update-state", (_event, payload) => updateState(payload?.id, payload?.patch));
ipcMain.handle("maildesk:sync-now", async () => {
  try {
    return await syncWithSupabase(effectiveSettings());
  } catch (error) {
    return { configured: true, ok: false, mode: "local-only", message: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle("maildesk:backup-export", async () => {
  const stamp = new Date().toISOString().slice(0, 10);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Exporter une sauvegarde MailDesk",
    defaultPath: path.join(app.getPath("documents"), `MailDesk-backup-${stamp}.db`),
    filters: [
      { name: "Sauvegarde MailDesk", extensions: ["db"] },
      { name: "Tous les fichiers", extensions: ["*"] },
    ],
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  const savedPath = createDatabaseBackup(result.filePath);
  return { ok: true, canceled: false, path: savedPath };
});

ipcMain.handle("maildesk:backup-restore", async () => {
  const selected = await dialog.showOpenDialog(mainWindow, {
    title: "Restaurer une sauvegarde MailDesk",
    properties: ["openFile"],
    filters: [
      { name: "Sauvegarde MailDesk", extensions: ["db"] },
      { name: "Tous les fichiers", extensions: ["*"] },
    ],
  });
  if (selected.canceled || !selected.filePaths[0]) return { ok: false, canceled: true };

  const confirmation = await dialog.showMessageBox(mainWindow, {
    type: "warning",
    title: "Restaurer la sauvegarde ?",
    message: "Les données locales actuelles vont être remplacées.",
    detail: "MailDesk créera automatiquement une copie de sécurité de la base actuelle avant la restauration. Les clés API et paramètres chiffrés ne sont pas modifiés.",
    buttons: ["Annuler", "Restaurer"],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  if (confirmation.response !== 1) return { ok: false, canceled: true };

  const restored = restoreDatabaseBackup(selected.filePaths[0]);
  notifyOutboxUpdated();
  return { ok: true, canceled: false, ...restored };
});

ipcMain.handle("maildesk:data-folder-open", async () => {
  const folder = app.getPath("userData");
  const error = await shell.openPath(folder);
  return { ok: !error, path: folder, error: error || undefined };
});

ipcMain.handle("maildesk:app-info", () => ({
  version: app.getVersion(),
  isPackaged: app.isPackaged,
  userDataPath: app.getPath("userData"),
  databasePath: databasePath(),
}));

ipcMain.handle("maildesk:windows-integration-get", () => windowsIntegrationStatus());
ipcMain.handle("maildesk:windows-startup-set", (_event, enabled) => setOpenAtLogin(enabled));
ipcMain.handle("maildesk:mailto-set", (_event, enabled) => {
  const ok = setMailtoHandler(Boolean(enabled));
  return { ...windowsIntegrationStatus(), ok };
});
ipcMain.handle("maildesk:unread-count", (_event, count) => updateUnreadCount(count));
ipcMain.handle("maildesk:renderer-ready", () => {
  flushPendingMailto();
  return true;
});

pendingMailto = findMailtoArgument(process.argv);
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  isQuitting = true;
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine) => {
    const mailto = findMailtoArgument(commandLine);
    if (mailto) dispatchMailto(mailto);
    else showMainWindow();
  });
  app.on("open-url", (event, url) => {
    event.preventDefault();
    dispatchMailto(parseMailtoUrl(url));
  });
}

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;
  applyStoredSettings();

  if (!hasConfiguredAccount()) {
    const configured = await showFirstRunSetup();
    if (!configured) {
      isQuitting = true;
      app.quit();
      return;
    }
  }

  applyStoredSettings();
  getSnapshot();
  resetSendingOutbox();
  buildApplicationMenu(() => mainWindow);
  applicationUrl = app.isPackaged ? await startProductionServer() : "http://127.0.0.1:3000";
  createWindow(applicationUrl);
  createTray();

  setTimeout(() => void processOutbox(), 2000);
  outboxTimer = setInterval(() => void processOutbox(), 60_000);

  app.on("activate", () => {
    showMainWindow();
  });
});

app.on("window-all-closed", () => {
  // Outlook-like behavior: the application remains available from the Windows tray.
});

app.on("before-quit", () => {
  isQuitting = true;
  tray?.destroy();
  tray = null;
  if (outboxTimer) clearInterval(outboxTimer);
  outboxTimer = null;
  if (outboxWakeTimer) clearTimeout(outboxWakeTimer);
  outboxWakeTimer = null;
  closeDatabase();
  if (nextServer) nextServer.close();
  if (nextApplication?.close) void nextApplication.close();
});
