const {
  exportContacts,
  exportCustomFolders,
  exportRows,
  exportRules,
  markSynced,
  mergeRemoteContacts,
  mergeRemoteCustomFolders,
  mergeRemoteRows,
  mergeRemoteRules,
} = require("./db.cjs");

const TABLES = {
  messages: "maildesk_messages",
  contacts: "maildesk_contacts",
  folders: "maildesk_folders",
  rules: "maildesk_rules",
};

function headers(key, extra = {}) {
  const authHeaders = { apikey: key };
  if (!String(key).startsWith("sb_")) {
    authHeaders.Authorization = `Bearer ${key}`;
  }
  return {
    ...authHeaders,
    ...extra,
  };
}

async function responseDetail(response) {
  try {
    const body = await response.json();
    return body.message || body.hint || body.details || JSON.stringify(body);
  } catch {
    return await response.text().catch(() => "");
  }
}

async function failure(response, table) {
  const detail = await responseDetail(response);
  if (response.status === 404) {
    return new Error(`La table Supabase '${table}' est introuvable. Utilisez « Créer / réparer les tables » dans Paramètres > Supabase.`);
  }
  if (response.status === 401 || response.status === 403) {
    return new Error("La clé de synchronisation Supabase n'a pas les droits requis. Utilisez une clé service_role / secret de projet.");
  }
  return new Error(`Synchronisation Supabase impossible (${response.status})${detail ? ` : ${detail}` : ""}`);
}

async function pullTable(url, key, table, optional = false) {
  const response = await fetch(`${url}/rest/v1/${table}?select=*`, {
    headers: headers(key, { Accept: "application/json" }),
  });

  if (response.status === 404 && optional) {
    return { available: false, rows: [] };
  }
  if (!response.ok) throw await failure(response, table);
  const rows = await response.json();
  return { available: true, rows: Array.isArray(rows) ? rows : [] };
}

async function pushTable(url, key, table, rows) {
  if (!rows.length) return;
  const response = await fetch(`${url}/rest/v1/${table}?on_conflict=${table === TABLES.contacts ? "email" : "id"}`, {
    method: "POST",
    headers: headers(key, {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    }),
    body: JSON.stringify(rows),
  });
  if (!response.ok) throw await failure(response, table);
}

async function syncWithSupabase(settings) {
  const url = String(settings?.supabaseUrl || "").replace(/\/$/, "");
  const key = String(settings?.supabaseKey || "").trim();
  if (!url || !key) {
    return { configured: false, ok: true, mode: "local-only", message: "Base locale active" };
  }

  const remoteMessages = await pullTable(url, key, TABLES.messages);
  mergeRemoteRows(remoteMessages.rows);

  const [remoteContacts, remoteFolders, remoteRules] = await Promise.all([
    pullTable(url, key, TABLES.contacts, true),
    pullTable(url, key, TABLES.folders, true),
    pullTable(url, key, TABLES.rules, true),
  ]);

  if (remoteContacts.available) mergeRemoteContacts(remoteContacts.rows);
  if (remoteFolders.available) mergeRemoteCustomFolders(remoteFolders.rows);
  if (remoteRules.available) mergeRemoteRules(remoteRules.rows);

  const localMessages = exportRows();
  const localContacts = exportContacts();
  const localFolders = exportCustomFolders();
  const localRules = exportRules();

  await pushTable(url, key, TABLES.messages, localMessages);
  if (remoteContacts.available) await pushTable(url, key, TABLES.contacts, localContacts);
  if (remoteFolders.available) await pushTable(url, key, TABLES.folders, localFolders);
  if (remoteRules.available) await pushTable(url, key, TABLES.rules, localRules);

  markSynced();

  const extrasReady = remoteContacts.available && remoteFolders.available && remoteRules.available;
  return {
    configured: true,
    ok: true,
    mode: "local+supabase",
    rows: localMessages.length,
    contacts: localContacts.length,
    folders: localFolders.length,
    rules: localRules.length,
    message: extrasReady
      ? "Base locale, contacts, dossiers et règles synchronisés avec Supabase"
      : "Mails synchronisés avec Supabase. Utilisez « Créer / réparer les tables » pour activer la synchro Contacts/Dossiers/Règles.",
  };
}

module.exports = { syncWithSupabase };
