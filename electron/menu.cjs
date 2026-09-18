const { BrowserWindow, Menu, app } = require("electron");

function buildApplicationMenu(getWindow) {
  const emit = (action, payload = {}) => {
    const win = getWindow();
    if (!win || win.isDestroyed()) return;
    win.webContents.send("maildesk:app-action", { action, ...payload });
  };

  const template = [
    {
      label: "Fichier",
      submenu: [
        { label: "Nouveau message", accelerator: "CmdOrCtrl+N", click: () => emit("compose") },
        { type: "separator" },
        { label: "Contacts", accelerator: "CmdOrCtrl+5", click: () => emit("contacts") },
        { label: "Paramètres", accelerator: "CmdOrCtrl+,", click: () => emit("settings") },
        { type: "separator" },
        { label: "Exporter une sauvegarde...", click: () => emit("backup-export") },
        { label: "Restaurer une sauvegarde...", click: () => emit("backup-restore") },
        { label: "Ouvrir le dossier de données", click: () => emit("data-folder") },
        { type: "separator" },
        { role: "quit", label: "Quitter" },
      ],
    },
    {
      label: "Message",
      submenu: [
        { label: "Répondre", accelerator: "CmdOrCtrl+R", click: () => emit("reply") },
        { label: "Répondre à tous", accelerator: "CmdOrCtrl+Shift+R", click: () => emit("reply-all") },
        { label: "Transférer", accelerator: "CmdOrCtrl+F", click: () => emit("forward") },
        { type: "separator" },
        { label: "Imprimer...", accelerator: "CmdOrCtrl+P", click: () => emit("print") },
        { label: "Exporter la conversation en PDF...", click: () => emit("export-pdf") },
        { label: "Exporter le message en EML...", click: () => emit("export-eml") },
        { type: "separator" },
        { label: "Archiver", accelerator: "CmdOrCtrl+Shift+A", click: () => emit("archive") },
        { label: "Supprimer", click: () => emit("delete") },
        { type: "separator" },
        { label: "Marquer comme lu", click: () => emit("mark-read") },
        { label: "Marquer comme non lu", accelerator: "CmdOrCtrl+U", click: () => emit("mark-unread") },
        { label: "Ajouter/retirer le favori", accelerator: "CmdOrCtrl+Shift+G", click: () => emit("toggle-star") },
      ],
    },
    {
      label: "Affichage",
      submenu: [
        { label: "Boîte de réception", accelerator: "CmdOrCtrl+1", click: () => emit("folder", { folder: "inbox" }) },
        { label: "Éléments envoyés", accelerator: "CmdOrCtrl+2", click: () => emit("folder", { folder: "sent" }) },
        { label: "Archives", accelerator: "CmdOrCtrl+3", click: () => emit("folder", { folder: "archive" }) },
        { label: "Corbeille", accelerator: "CmdOrCtrl+4", click: () => emit("folder", { folder: "trash" }) },
        { type: "separator" },
        { label: "Rechercher", accelerator: "CmdOrCtrl+E", click: () => emit("search") },
        { label: "Actualiser", accelerator: "F5", click: () => emit("refresh") },
        { type: "separator" },
        { role: "resetZoom", label: "Taille réelle" },
        { role: "zoomIn", label: "Agrandir" },
        { role: "zoomOut", label: "Réduire" },
        { role: "togglefullscreen", label: "Plein écran" },
      ],
    },
    {
      label: "Édition",
      submenu: [
        { role: "undo", label: "Annuler" },
        { role: "redo", label: "Rétablir" },
        { type: "separator" },
        { role: "cut", label: "Couper" },
        { role: "copy", label: "Copier" },
        { role: "paste", label: "Coller" },
        { role: "selectAll", label: "Tout sélectionner" },
      ],
    },
  ];

  if (!app.isPackaged) {
    template.push({
      label: "Développement",
      submenu: [
        { role: "reload", label: "Recharger la fenêtre" },
        { role: "toggleDevTools", label: "Outils de développement" },
      ],
    });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function popupMailContextMenu(event, payload) {
  const webContents = event.sender;
  const send = (action) => webContents.send("maildesk:context-action", { action, id: payload.id });
  const inTrash = payload.folder === "trash";
  const inArchive = payload.folder === "archive";

  const items = [
    { label: "Répondre", click: () => send("reply") },
    { label: "Répondre à tous", click: () => send("reply-all") },
    { label: "Transférer", click: () => send("forward") },
    { type: "separator" },
    { label: payload.isRead ? "Marquer comme non lu" : "Marquer comme lu", click: () => send(payload.isRead ? "mark-unread" : "mark-read") },
    { label: payload.isStarred ? "Retirer des favoris" : "Ajouter aux favoris", click: () => send("toggle-star") },
    { label: payload.isFlagged ? "Retirer le drapeau" : "Marquer comme important", click: () => send("toggle-flag") },
    { label: payload.isPinned ? "Désépingler" : "Épingler en haut", click: () => send("toggle-pin") },
    {
      label: "Catégoriser",
      submenu: [
        { label: "Rouge", click: () => send("category-red") },
        { label: "Orange", click: () => send("category-orange") },
        { label: "Jaune", click: () => send("category-yellow") },
        { label: "Vert", click: () => send("category-green") },
        { label: "Bleu", click: () => send("category-blue") },
        { label: "Violet", click: () => send("category-purple") },
        { type: "separator" },
        { label: "Effacer la catégorie", click: () => send("category-clear") },
      ],
    },
    {
      label: "Mettre en attente",
      submenu: [
        { label: "Dans 1 heure", click: () => send("snooze-1h") },
        { label: "Demain matin", click: () => send("snooze-tomorrow") },
        { label: "Semaine prochaine", click: () => send("snooze-week") },
      ],
    },
    ...(Array.isArray(payload.customFolders) && payload.customFolders.length
      ? [{
          label: "Déplacer vers",
          submenu: payload.customFolders.map((folder) => ({
            label: folder.name,
            click: () => send(`move-folder:${folder.id}`),
          })),
        }]
      : []),
    { type: "separator" },
  ];

  if (payload.folder === "snoozed") {
    items.push({ label: "Remettre maintenant dans la boîte de réception", click: () => send("unsnooze") });
  }

  if (payload.folder === "junk") {
    items.push({ label: "Ce message n'est pas indésirable", click: () => send("not-junk") });
  } else if (payload.canBlock) {
    items.push(
      { label: "Marquer comme indésirable", click: () => send("junk") },
      { label: "Bloquer l'expéditeur", click: () => send("block-sender") },
    );
  }

  items.push({ type: "separator" });

  if (inTrash) {
    items.push(
      { label: "Restaurer", click: () => send("restore") },
      { label: "Supprimer définitivement", click: () => send("delete-forever") },
    );
  } else {
    if (inArchive) items.push({ label: "Restaurer dans la boîte de réception", click: () => send("restore") });
    else items.push({ label: "Archiver", click: () => send("archive") });
    items.push({ label: "Supprimer", click: () => send("delete") });
  }

  const window = BrowserWindow.fromWebContents(webContents);
  Menu.buildFromTemplate(items).popup({ window });
}

module.exports = { buildApplicationMenu, popupMailContextMenu };
