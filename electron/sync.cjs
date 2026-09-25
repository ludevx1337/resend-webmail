const {
  exportBlockedSenders,
  exportCalendarEvents,
  exportContacts,
  exportCustomFolders,
  exportRows,
  exportRules,
  exportTemplates,
  getSyncState,
  markSynced,
  mergeRemoteBlockedSenders,
  mergeRemoteCalendarEvents,
  mergeRemoteContacts,
  mergeRemoteCustomFolders,
  mergeRemoteRows,
  mergeRemoteRules,
  mergeRemoteTemplates,
  setSyncState,
} = require("./db.cjs");

const TABLES = {
  messages: "maildesk_messages",
  contacts: "maildesk_contacts",
  folders: "maildesk_folders",
  rules: "maildesk_rules",
  templates: "maildesk_templates",
  calendar: "maildesk_calendar_events",
  blocked: "maildesk_blocked_senders",
  profile: "maildesk_profile",
};

function jwtRole(value) {
  const token = String(value || "").trim();
  const parts = token.split(".");
  if (parts.length !== 3) return "";
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return String(payload?.role || "");
  } catch {
    return "";
  }
}

function isSecretKey(value) {
  const key = String(value || "").trim();
  return key.startsWith("sb_secret_") || jwtRole(key) === "service_role";
}

function resolveSyncCredentials(settings = {}) {
  const secretKey = String(settings.supabaseKey || "").trim();
  if (isSecretKey(secretKey)) {
    return {
      apikey: secretKey,
      bearer: secretKey.startsWith("sb_secret_") ? "" : secretKey,
      mode: "service",
    };
  }

  const publishableKey = String(settings.supabasePublishableKey || secretKey || "").trim();
  const accessToken = String(settings.supabaseAuthAccessToken || "").trim();
  if (publishableKey && accessToken) {
    return { apikey: publishableKey, bearer: accessToken, mode: "user" };
  }

  if (secretKey) {
    return {
      apikey: secretKey,
      bearer: String(secretKey).startsWith("sb_") ? "" : secretKey,
      mode: "legacy",
    };
  }
  if (publishableKey) return { apikey: publishableKey, bearer: "", mode: "public" };
  return { apikey: "", bearer: "", mode: "none" };
}

function headers(credentials, extra = {}) {
  const apikey = typeof credentials === "string"
    ? credentials
    : String(credentials?.apikey || "").trim();
  const bearer = typeof credentials === "string"
    ? (!String(credentials).startsWith("sb_") ? String(credentials) : "")
    : String(credentials?.bearer || "").trim();
  return {
    ...(apikey ? { apikey } : {}),
    ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
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
    return new Error("Accès Supabase refusé. Reconnectez l’espace MailDesk ou vérifiez les droits RLS du compte.");
  }
  return new Error(`Synchronisation Supabase impossible (${response.status})${detail ? ` : ${detail}` : ""}`);
}

function overlapCursor(value, overlapMs = 2 * 60 * 1000) {
  if (!value) return "";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";
  return new Date(Math.max(0, timestamp - overlapMs)).toISOString();
}

function latestTimestamp(rows, previous = "") {
  let latest = previous || "";
  let latestTime = latest ? new Date(latest).getTime() : 0;
  for (const row of rows || []) {
    const candidate = String(row?.updated_at || "");
    const time = candidate ? new Date(candidate).getTime() : 0;
    if (Number.isFinite(time) && time > latestTime) {
      latest = candidate;
      latestTime = time;
    }
  }
  return latest;
}

async function pullTable(url, key, table, optional = false, options = {}) {
  const query = new URLSearchParams({ select: "*" });
  if (options.updatedAfter) query.set("updated_at", `gt.${options.updatedAfter}`);
  if (options.orderByUpdatedAt) query.set("order", "updated_at.asc");

  const response = await fetch(`${url}/rest/v1/${table}?${query.toString()}`, {
    headers: headers(key, { Accept: "application/json" }),
  });

  if (optional && [401, 403, 404].includes(response.status)) {
    return {
      available: false,
      rows: [],
      reason: response.status === 404 ? "missing" : "permission",
    };
  }
  if (!response.ok) throw await failure(response, table);
  const rows = await response.json();
  return { available: true, rows: Array.isArray(rows) ? rows : [] };
}

async function pullAllTable(url, key, table, optional = false) {
  const pageSize = 1000;
  const rows = [];
  for (let offset = 0; offset < 100000; offset += pageSize) {
    const query = new URLSearchParams({
      select: "*",
      limit: String(pageSize),
      offset: String(offset),
    });
    const response = await fetch(`${url}/rest/v1/${table}?${query.toString()}`, {
      headers: headers(key, { Accept: "application/json" }),
    });
    if (optional && [401, 403, 404].includes(response.status)) {
      return {
        available: false,
        rows: [],
        reason: response.status === 404 ? "missing" : "permission",
      };
    }
    if (!response.ok) throw await failure(response, table);
    const page = await response.json();
    const batch = Array.isArray(page) ? page : [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return { available: true, rows };
}

async function restoreFromSupabase(settings) {
  const url = String(settings?.supabaseUrl || "").replace(/\/$/, "");
  const credentials = resolveSyncCredentials(settings);
  if (!url || !credentials.apikey || !credentials.bearer) {
    throw new Error("Une session utilisateur Supabase valide est nécessaire pour restaurer cet espace MailDesk.");
  }

  const remoteMessages = await pullAllTable(url, credentials, TABLES.messages, false);
  const [
    remoteContacts,
    remoteFolders,
    remoteRules,
    remoteTemplates,
    remoteCalendar,
    remoteBlocked,
    remoteProfile,
  ] = await Promise.all([
    pullAllTable(url, credentials, TABLES.contacts, true),
    pullAllTable(url, credentials, TABLES.folders, true),
    pullAllTable(url, credentials, TABLES.rules, true),
    pullAllTable(url, credentials, TABLES.templates, true),
    pullAllTable(url, credentials, TABLES.calendar, true),
    pullAllTable(url, credentials, TABLES.blocked, true),
    pullAllTable(url, credentials, TABLES.profile, true),
  ]);

  mergeRemoteRows(remoteMessages.rows);
  if (remoteContacts.available) mergeRemoteContacts(remoteContacts.rows);
  if (remoteFolders.available) mergeRemoteCustomFolders(remoteFolders.rows);
  if (remoteRules.available) mergeRemoteRules(remoteRules.rows);
  if (remoteTemplates.available) mergeRemoteTemplates(remoteTemplates.rows);
  if (remoteCalendar.available) mergeRemoteCalendarEvents(remoteCalendar.rows);
  if (remoteBlocked.available) mergeRemoteBlockedSenders(remoteBlocked.rows);

  const cursor = latestTimestamp(remoteMessages.rows);
  if (cursor) setSyncState(`supabase:${TABLES.messages}:updated_at`, cursor);

  const profile = (remoteProfile.rows || []).find((row) => String(row?.id || "") === "default") || null;
  const optionalTables = {
    contacts: remoteContacts,
    folders: remoteFolders,
    rules: remoteRules,
    templates: remoteTemplates,
    calendar: remoteCalendar,
    blocked: remoteBlocked,
    profile: remoteProfile,
  };
  const missingTables = Object.entries(optionalTables)
    .filter(([, value]) => !value.available)
    .map(([name]) => name);

  return {
    ok: true,
    configured: true,
    mode: "restore",
    messages: remoteMessages.rows.length,
    contacts: remoteContacts.rows.length,
    folders: remoteFolders.rows.length,
    rules: remoteRules.rows.length,
    templates: remoteTemplates.rows.length,
    calendarEvents: remoteCalendar.rows.length,
    blockedSenders: remoteBlocked.rows.length,
    profile: profile
      ? {
          defaultFrom: String(profile.default_from || ""),
          signatureHtml: String(profile.signature_html || ""),
          updatedAt: String(profile.updated_at || ""),
        }
      : null,
    missingTables,
    message: missingTables.length
      ? `Restauration terminée. Tables optionnelles absentes : ${missingTables.join(", ")}.`
      : "Espace MailDesk restauré depuis Supabase.",
  };
}

async function supportsColumns(url, key, table, columns) {
  const query = new URLSearchParams({
    select: ["id", ...columns].join(","),
    limit: "1",
  });
  const response = await fetch(`${url}/rest/v1/${table}?${query.toString()}`, {
    headers: headers(key, { Accept: "application/json" }),
  });
  if (response.status === 400 || response.status === 404) return false;
  if (!response.ok) throw await failure(response, table);
  return true;
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

function changedRows(localRows, remoteRows, keyField = "id") {
  const remoteByKey = new Map(
    (remoteRows || [])
      .filter((row) => row?.[keyField] != null)
      .map((row) => [String(row[keyField]), row]),
  );

  return (localRows || []).filter((row) => {
    const key = String(row?.[keyField] ?? "");
    if (!key) return false;
    const remote = remoteByKey.get(key);
    if (!remote) return true;
    const localTime = new Date(row.updated_at || 0).getTime();
    const remoteTime = new Date(remote.updated_at || 0).getTime();
    return Number.isFinite(localTime) && (!Number.isFinite(remoteTime) || localTime > remoteTime);
  });
}

async function performSyncWithSupabase(settings) {
  const url = String(settings?.supabaseUrl || "").replace(/\/$/, "");
  const credentials = resolveSyncCredentials(settings);
  if (!url || !credentials.apikey) {
    return { configured: false, ok: true, mode: "local-only", message: "Base locale active" };
  }

  const key = credentials;
  const messageCursorKey = `supabase:${TABLES.messages}:updated_at`;
  const previousMessageCursor = getSyncState(messageCursorKey);
  const remoteMessages = await pullTable(url, key, TABLES.messages, false, {
    updatedAfter: overlapCursor(previousMessageCursor),
    orderByUpdatedAt: true,
  });
  mergeRemoteRows(remoteMessages.rows);

  const [
    remoteContacts,
    remoteFolders,
    remoteRules,
    remoteTemplates,
    remoteCalendar,
    remoteBlocked,
    remoteProfile,
  ] = await Promise.all([
    pullTable(url, key, TABLES.contacts, true),
    pullTable(url, key, TABLES.folders, true),
    pullTable(url, key, TABLES.rules, true),
    pullTable(url, key, TABLES.templates, true),
    pullTable(url, key, TABLES.calendar, true),
    pullTable(url, key, TABLES.blocked, true),
    pullTable(url, key, TABLES.profile, true),
  ]);

  if (remoteContacts.available) mergeRemoteContacts(remoteContacts.rows);
  if (remoteFolders.available) mergeRemoteCustomFolders(remoteFolders.rows);
  if (remoteRules.available) mergeRemoteRules(remoteRules.rows);
  if (remoteTemplates.available) mergeRemoteTemplates(remoteTemplates.rows);
  if (remoteCalendar.available) mergeRemoteCalendarEvents(remoteCalendar.rows);
  if (remoteBlocked.available) mergeRemoteBlockedSenders(remoteBlocked.rows);

  // Messages: only local rows changed since their last successful push.
  const dirtyMessages = exportRows({ dirtyOnly: true });
  await pushTable(url, key, TABLES.messages, dirtyMessages);
  if (dirtyMessages.length) markSynced(dirtyMessages.map((row) => row.id));

  const nextMessageCursor = latestTimestamp(remoteMessages.rows, previousMessageCursor);
  if (nextMessageCursor) setSyncState(messageCursorKey, nextMessageCursor);

  const localContacts = exportContacts();
  const localFolders = exportCustomFolders();
  const localTemplates = exportTemplates();
  const localCalendar = exportCalendarEvents();
  const localBlocked = exportBlockedSenders();

  const contactsToPush = remoteContacts.available ? changedRows(localContacts, remoteContacts.rows, "email") : [];
  const foldersToPush = remoteFolders.available ? changedRows(localFolders, remoteFolders.rows) : [];
  const templatesToPush = remoteTemplates.available ? changedRows(localTemplates, remoteTemplates.rows) : [];
  const calendarToPush = remoteCalendar.available ? changedRows(localCalendar, remoteCalendar.rows) : [];
  const blockedToPush = remoteBlocked.available ? changedRows(localBlocked, remoteBlocked.rows, "email") : [];

  if (remoteContacts.available) await pushTable(url, key, TABLES.contacts, contactsToPush);
  if (remoteFolders.available) await pushTable(url, key, TABLES.folders, foldersToPush);
  if (remoteTemplates.available) await pushTable(url, key, TABLES.templates, templatesToPush);
  if (remoteCalendar.available) await pushTable(url, key, TABLES.calendar, calendarToPush);
  if (remoteBlocked.available) await pushTable(url, key, TABLES.blocked, blockedToPush);

  let profilePushed = 0;
  if (remoteProfile.available) {
    const remoteDefault = (remoteProfile.rows || []).find((row) => String(row?.id || "") === "default");
    const nextDefaultFrom = String(settings?.from || "");
    const nextSignature = String(settings?.signature || "");
    if (!remoteDefault
      || String(remoteDefault.default_from || "") !== nextDefaultFrom
      || String(remoteDefault.signature_html || "") !== nextSignature) {
      await pushTable(url, key, TABLES.profile, [{
        id: "default",
        default_from: nextDefaultFrom,
        signature_html: nextSignature,
        updated_at: new Date().toISOString(),
      }]);
      profilePushed = 1;
    }
  }

  let ruleSchemaV2 = false;
  let localRules = [];
  let rulesToPush = [];
  if (remoteRules.available) {
    ruleSchemaV2 = await supportsColumns(url, key, TABLES.rules, [
      "conditions_json",
      "actions_json",
      "match_mode",
      "priority",
      "stop_processing",
    ]);
    localRules = exportRules({ legacyOnly: !ruleSchemaV2 });
    rulesToPush = changedRows(localRules, remoteRules.rows);
    await pushTable(url, key, TABLES.rules, rulesToPush);
  }

  const extrasReady = remoteContacts.available && remoteFolders.available && remoteRules.available
    && remoteTemplates.available && remoteCalendar.available && remoteBlocked.available && remoteProfile.available;
  const message = !extrasReady
    ? "Mails synchronisés en mode différentiel. Utilisez « Créer / réparer les tables » pour activer la synchro complète."
    : remoteRules.available && !ruleSchemaV2
      ? "Synchronisation différentielle active. Les règles simples sont synchronisées ; réparez les tables Supabase pour synchroniser les règles V2."
      : "Synchronisation différentielle active : seuls les éléments modifiés sont envoyés vers Supabase.";

  return {
    configured: true,
    ok: true,
    mode: "local+supabase-delta",
    rows: dirtyMessages.length,
    pulledRows: remoteMessages.rows.length,
    contacts: contactsToPush.length,
    folders: foldersToPush.length,
    rules: rulesToPush.length,
    templates: templatesToPush.length,
    calendarEvents: calendarToPush.length,
    blockedSenders: blockedToPush.length,
    profile: profilePushed,
    message,
  };
}

let activeSync = null;

async function syncWithSupabase(settings) {
  if (activeSync) return activeSync;
  activeSync = performSyncWithSupabase(settings);
  try {
    return await activeSync;
  } finally {
    activeSync = null;
  }
}

module.exports = { restoreFromSupabase, syncWithSupabase };
