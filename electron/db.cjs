const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { app } = require("electron");
const { DatabaseSync } = require("node:sqlite");

let database = null;

function databasePath() {
  return path.join(app.getPath("userData"), "maildesk.db");
}

function ensureTableColumn(db, table, name, definition) {
  const columns = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => String(row.name)));
  if (!columns.has(name)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
}

function getDb() {
  if (database) return database;
  const file = databasePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  database = new DatabaseSync(file);
  database.exec("PRAGMA journal_mode = WAL;");
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      direction TEXT NOT NULL CHECK(direction IN ('inbound','outbound')),
      created_at TEXT,
      from_addr TEXT,
      to_json TEXT NOT NULL DEFAULT '[]',
      cc_json TEXT NOT NULL DEFAULT '[]',
      bcc_json TEXT NOT NULL DEFAULT '[]',
      reply_to_json TEXT NOT NULL DEFAULT '[]',
      subject TEXT,
      message_id TEXT,
      headers_json TEXT NOT NULL DEFAULT '{}',
      parent_message_id TEXT,
      references_json TEXT NOT NULL DEFAULT '[]',
      html TEXT,
      text_body TEXT,
      attachments_json TEXT NOT NULL DEFAULT '[]',
      remote_payload TEXT,
      folder TEXT NOT NULL DEFAULT 'inbox',
      is_read INTEGER NOT NULL DEFAULT 0,
      is_starred INTEGER NOT NULL DEFAULT 0,
      is_flagged INTEGER NOT NULL DEFAULT 0,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      category TEXT,
      snoozed_until TEXT,
      updated_at TEXT NOT NULL,
      synced_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_messages_folder_created ON messages(folder, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_updated ON messages(updated_at);

    CREATE TABLE IF NOT EXISTS drafts (
      id TEXT PRIMARY KEY,
      from_addr TEXT NOT NULL DEFAULT '',
      to_addr TEXT NOT NULL DEFAULT '',
      cc_addr TEXT NOT NULL DEFAULT '',
      bcc_addr TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL DEFAULT '',
      text_body TEXT NOT NULL DEFAULT '',
      html TEXT NOT NULL DEFAULT '',
      reply_to_message_id TEXT,
      reply_references_json TEXT NOT NULL DEFAULT '[]',
      attachments_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_drafts_updated ON drafts(updated_at DESC);

    CREATE TABLE IF NOT EXISTS outbox (
      id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','failed')),
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      next_attempt_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_outbox_status_next ON outbox(status, next_attempt_at, created_at);

    CREATE TABLE IF NOT EXISTS contacts (
      email TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      company TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      tags_json TEXT NOT NULL DEFAULT '[]',
      times_seen INTEGER NOT NULL DEFAULT 0,
      last_seen_at TEXT,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      is_hidden INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'learned',
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_contacts_rank ON contacts(is_favorite DESC, times_seen DESC, last_seen_at DESC);

    CREATE TABLE IF NOT EXISTS mail_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      field TEXT NOT NULL CHECK(field IN ('from','subject','to')),
      operator TEXT NOT NULL CHECK(operator IN ('contains','equals','ends_with')),
      value TEXT NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('archive','star','read','trash','move_to_folder')),
      action_value TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mail_rules_enabled ON mail_rules(enabled, created_at);

    CREATE TABLE IF NOT EXISTS custom_folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS blocked_senders (
      email TEXT PRIMARY KEY,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mail_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      html TEXT NOT NULL DEFAULT '',
      text_body TEXT NOT NULL DEFAULT '',
      shortcut TEXT NOT NULL DEFAULT '',
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mail_templates_name ON mail_templates(is_deleted, name);

    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      all_day INTEGER NOT NULL DEFAULT 0,
      attendees_json TEXT NOT NULL DEFAULT '[]',
      source_uid TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_calendar_events_start ON calendar_events(is_deleted, start_at);

    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      id UNINDEXED,
      subject,
      sender,
      recipients,
      body,
      attachments
    );
  `);

  ensureTableColumn(database, "messages", "headers_json", "TEXT NOT NULL DEFAULT '{}'");
  ensureTableColumn(database, "messages", "parent_message_id", "TEXT");
  ensureTableColumn(database, "messages", "references_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureTableColumn(database, "messages", "category", "TEXT");
  ensureTableColumn(database, "messages", "snoozed_until", "TEXT");
  ensureTableColumn(database, "messages", "is_flagged", "INTEGER NOT NULL DEFAULT 0");
  ensureTableColumn(database, "messages", "is_pinned", "INTEGER NOT NULL DEFAULT 0");
  ensureTableColumn(database, "drafts", "from_addr", "TEXT NOT NULL DEFAULT ''");
  ensureTableColumn(database, "drafts", "reply_references_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureTableColumn(database, "contacts", "company", "TEXT NOT NULL DEFAULT ''");
  ensureTableColumn(database, "contacts", "phone", "TEXT NOT NULL DEFAULT ''");
  ensureTableColumn(database, "contacts", "notes", "TEXT NOT NULL DEFAULT ''");
  ensureTableColumn(database, "contacts", "tags_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureTableColumn(database, "contacts", "is_hidden", "INTEGER NOT NULL DEFAULT 0");
  ensureTableColumn(database, "custom_folders", "is_deleted", "INTEGER NOT NULL DEFAULT 0");
  ensureTableColumn(database, "mail_rules", "action_value", "TEXT");
  ensureTableColumn(database, "mail_rules", "is_deleted", "INTEGER NOT NULL DEFAULT 0");
  database.exec("DROP INDEX IF EXISTS idx_custom_folders_name;");
  database.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_folders_name ON custom_folders(lower(name)) WHERE is_deleted = 0;");

  const mailRulesSql = String(
    database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'mail_rules'").get()?.sql || "",
  );
  if (!mailRulesSql.includes("move_to_folder")) {
    database.exec("BEGIN");
    try {
      database.exec("ALTER TABLE mail_rules RENAME TO mail_rules_legacy;");
      database.exec(`
        CREATE TABLE mail_rules (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          field TEXT NOT NULL CHECK(field IN ('from','subject','to')),
          operator TEXT NOT NULL CHECK(operator IN ('contains','equals','ends_with')),
          value TEXT NOT NULL,
          action TEXT NOT NULL CHECK(action IN ('archive','star','read','trash','move_to_folder')),
          action_value TEXT,
          enabled INTEGER NOT NULL DEFAULT 1,
          is_deleted INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      database.exec(`
        INSERT INTO mail_rules (
          id, name, field, operator, value, action, action_value, enabled, is_deleted, created_at, updated_at
        )
        SELECT
          id, name, field, operator, value, action, action_value, enabled, is_deleted, created_at, updated_at
        FROM mail_rules_legacy;
      `);
      database.exec("DROP TABLE mail_rules_legacy;");
      database.exec("CREATE INDEX IF NOT EXISTS idx_mail_rules_enabled ON mail_rules(enabled, created_at);");
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  const legacyActiveDraft = database.prepare("SELECT id FROM drafts WHERE id = 'active'").get();
  if (legacyActiveDraft) {
    database.prepare("UPDATE drafts SET id = ? WHERE id = 'active'").run(randomUUID());
  }

  const legacyPayloadRows = database.prepare(`
    SELECT id, remote_payload
    FROM messages
    WHERE remote_payload IS NOT NULL
      AND headers_json = '{}'
      AND parent_message_id IS NULL
      AND references_json = '[]'
  `).all();
  const updateLegacyThread = database.prepare(`
    UPDATE messages
    SET headers_json = ?, parent_message_id = ?, references_json = ?
    WHERE id = ?
  `);
  for (const row of legacyPayloadRows) {
    const payload = parse(row.remote_payload, {});
    const threading = threadMetadata(payload);
    if (Object.keys(threading.headers).length || threading.parent || threading.references.length) {
      updateLegacyThread.run(json(threading.headers, {}), threading.parent, json(threading.references), String(row.id));
    }
  }

  // Rebuild the FTS index on startup. The source of truth remains the messages table,
  // so migrations from older MailDesk versions automatically become searchable.
  database.exec("DELETE FROM messages_fts;");
  database.exec(`
    INSERT INTO messages_fts (id, subject, sender, recipients, body, attachments)
    SELECT
      id,
      COALESCE(subject, ''),
      COALESCE(from_addr, ''),
      COALESCE(to_json, '') || ' ' || COALESCE(cc_json, '') || ' ' || COALESCE(bcc_json, ''),
      COALESCE(text_body, '') || ' ' || COALESCE(html, ''),
      COALESCE(attachments_json, '')
    FROM messages
    WHERE is_deleted = 0
  `);

  // Rebuild learned-contact frequency from the local message history so refreshes
  // never inflate ranking. Manual names/favorites are preserved.
  database.exec("UPDATE contacts SET times_seen = 0, last_seen_at = NULL;");
  const contactRows = database.prepare(`
    SELECT direction, created_at, from_addr, to_json, cc_json, bcc_json, reply_to_json
    FROM messages
    WHERE is_deleted = 0
    ORDER BY datetime(created_at) ASC
  `).all();
  for (const row of contactRows) {
    learnContactsFromMail(database, {
      created_at: row.created_at,
      from: row.from_addr,
      to: parse(row.to_json),
      cc: parse(row.cc_json),
      bcc: parse(row.bcc_json),
      reply_to: parse(row.reply_to_json),
    }, row.direction);
  }

  return database;
}

function json(value, fallback = []) {
  try {
    return JSON.stringify(value ?? fallback);
  } catch {
    return JSON.stringify(fallback);
  }
}

function parse(value, fallback = []) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function headerValue(headers, name) {
  if (!headers || typeof headers !== "object") return "";
  const target = String(name).toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === target) return String(value || "");
  }
  return "";
}

function messageIdList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  const raw = String(value || "").trim();
  if (!raw) return [];
  const bracketed = raw.match(/<[^>]+>/g);
  if (bracketed?.length) return bracketed.map((item) => item.trim());
  return raw.split(/\s+/).map((item) => item.trim()).filter(Boolean);
}

function threadMetadata(mail) {
  const headers = mail?.headers && typeof mail.headers === "object" ? mail.headers : {};
  const parentRaw = String(
    mail?.in_reply_to
    || mail?.parent_message_id
    || headerValue(headers, "in-reply-to")
    || "",
  ).trim();
  const parentIds = messageIdList(parentRaw);
  const parent = parentIds[parentIds.length - 1] || parentRaw || null;
  const references = messageIdList(
    mail?.references?.length
      ? mail.references
      : headerValue(headers, "references"),
  );
  return { headers, parent, references };
}

function parseContactAddress(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const angle = raw.match(/^(.*?)<([^<>\s]+@[^<>\s]+)>\s*$/);
  const email = (angle?.[2] || raw).replace(/^mailto:/i, "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  const name = angle?.[1]?.replace(/^["']|["']$/g, "").trim() || "";
  return { email, name };
}

function learnContact(db, address, seenAt) {
  const parsed = parseContactAddress(address);
  if (!parsed) return;
  const now = new Date().toISOString();
  const lastSeen = seenAt || now;
  db.prepare(`
    INSERT INTO contacts (email, name, times_seen, last_seen_at, is_favorite, source, updated_at)
    VALUES (?, ?, 1, ?, 0, 'learned', ?)
    ON CONFLICT(email) DO UPDATE SET
      name = CASE
        WHEN contacts.source = 'manual' AND contacts.name <> '' THEN contacts.name
        WHEN excluded.name <> '' THEN excluded.name
        ELSE contacts.name
      END,
      times_seen = contacts.times_seen + 1,
      last_seen_at = CASE
        WHEN contacts.last_seen_at IS NULL OR excluded.last_seen_at > contacts.last_seen_at THEN excluded.last_seen_at
        ELSE contacts.last_seen_at
      END,
      updated_at = excluded.updated_at
  `).run(parsed.email, parsed.name, lastSeen, now);
}

function learnContactsFromMail(db, mail, direction) {
  const seenAt = mail?.created_at || new Date().toISOString();
  const candidates = direction === "inbound"
    ? [mail?.from, ...(mail?.reply_to || [])]
    : [...(mail?.to || []), ...(mail?.cc || []), ...(mail?.bcc || [])];
  const seenEmails = new Set();
  for (const address of candidates) {
    const parsed = parseContactAddress(address);
    if (!parsed || seenEmails.has(parsed.email)) continue;
    seenEmails.add(parsed.email);
    learnContact(db, address, seenAt);
  }
}

function rowToContact(row) {
  if (!row) return null;
  return {
    email: row.email,
    name: row.name || "",
    company: row.company || "",
    phone: row.phone || "",
    notes: row.notes || "",
    tags: parse(row.tags_json),
    timesSeen: Number(row.times_seen || 0),
    lastSeenAt: row.last_seen_at || undefined,
    isFavorite: Boolean(row.is_favorite),
    source: row.source || "learned",
    updatedAt: row.updated_at,
  };
}

function listContacts(limit = 500) {
  return getDb().prepare(`
    SELECT * FROM contacts
    WHERE is_hidden = 0
    ORDER BY is_favorite DESC, times_seen DESC, datetime(last_seen_at) DESC, email ASC
    LIMIT ?
  `).all(Math.max(1, Math.min(1000, Number(limit) || 500))).map(rowToContact);
}

function searchContacts(query, limit = 8) {
  const value = String(query || "").trim().toLowerCase();
  if (!value) return listContacts(limit);
  const like = `%${value}%`;
  return getDb().prepare(`
    SELECT * FROM contacts
    WHERE is_hidden = 0
      AND (
        lower(email) LIKE ?
        OR lower(name) LIKE ?
        OR lower(company) LIKE ?
        OR lower(phone) LIKE ?
        OR lower(notes) LIKE ?
        OR lower(tags_json) LIKE ?
      )
    ORDER BY is_favorite DESC, times_seen DESC, datetime(last_seen_at) DESC, email ASC
    LIMIT ?
  `).all(like, like, like, like, like, like, Math.max(1, Math.min(50, Number(limit) || 8))).map(rowToContact);
}

function saveContact(contact = {}) {
  const parsed = parseContactAddress(contact.email);
  if (!parsed) throw new Error("Adresse email invalide.");
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO contacts (
      email, name, company, phone, notes, tags_json,
      times_seen, last_seen_at, is_favorite, is_hidden, source, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 0, 'manual', ?)
    ON CONFLICT(email) DO UPDATE SET
      name = excluded.name,
      company = excluded.company,
      phone = excluded.phone,
      notes = excluded.notes,
      tags_json = excluded.tags_json,
      is_favorite = excluded.is_favorite,
      is_hidden = 0,
      source = 'manual',
      updated_at = excluded.updated_at
  `).run(
    parsed.email,
    String(contact.name || "").trim(),
    String(contact.company || "").trim(),
    String(contact.phone || "").trim(),
    String(contact.notes || "").trim(),
    json(Array.isArray(contact.tags) ? contact.tags.map((item) => String(item).trim()).filter(Boolean) : []),
    now,
    Number(Boolean(contact.isFavorite)),
    now,
  );
  return rowToContact(db.prepare("SELECT * FROM contacts WHERE email = ?").get(parsed.email));
}

function deleteContact(email) {
  const value = String(email || "").trim().toLowerCase();
  getDb().prepare("UPDATE contacts SET is_hidden = 1, updated_at = ? WHERE email = ?")
    .run(new Date().toISOString(), value);
  return true;
}

function rowToCustomFolder(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function listCustomFolders() {
  return getDb().prepare("SELECT * FROM custom_folders WHERE is_deleted = 0 ORDER BY lower(name) ASC").all().map(rowToCustomFolder);
}

function saveCustomFolder(folder = {}) {
  const db = getDb();
  const name = String(folder.name || "").trim();
  if (!name) throw new Error("Le nom du dossier est requis.");
  if (name.length > 80) throw new Error("Le nom du dossier est trop long.");

  const id = String(folder.id || randomUUID());
  const now = new Date().toISOString();
  const duplicate = db.prepare("SELECT id FROM custom_folders WHERE lower(name) = lower(?) AND id <> ? AND is_deleted = 0").get(name, id);
  if (duplicate) throw new Error("Un dossier portant ce nom existe déjà.");

  const existing = db.prepare("SELECT created_at FROM custom_folders WHERE id = ?").get(id);
  db.prepare(`
    INSERT INTO custom_folders (id, name, is_deleted, created_at, updated_at)
    VALUES (?, ?, 0, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      is_deleted = 0,
      updated_at = excluded.updated_at
  `).run(id, name, existing?.created_at || now, now);
  return rowToCustomFolder(db.prepare("SELECT * FROM custom_folders WHERE id = ?").get(id));
}

function deleteCustomFolder(id) {
  const db = getDb();
  const folderId = String(id || "");
  const folder = db.prepare("SELECT * FROM custom_folders WHERE id = ?").get(folderId);
  if (!folder) return { ok: true, moved: 0, deletedRules: 0 };

  const now = new Date().toISOString();
  const moved = db.prepare(`
    UPDATE messages
    SET folder = CASE WHEN direction = 'outbound' THEN 'sent' ELSE 'inbox' END,
        updated_at = ?,
        synced_at = NULL
    WHERE folder = ?
  `).run(now, `custom:${folderId}`).changes;
  const deletedRules = db.prepare(`
    UPDATE mail_rules
    SET is_deleted = 1, updated_at = ?
    WHERE action = 'move_to_folder' AND action_value = ? AND is_deleted = 0
  `).run(now, folderId).changes;
  db.prepare("UPDATE custom_folders SET is_deleted = 1, updated_at = ? WHERE id = ?").run(now, folderId);
  return { ok: true, moved: Number(moved || 0), deletedRules: Number(deletedRules || 0) };
}

function rowToRule(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    field: row.field,
    operator: row.operator,
    value: row.value,
    action: row.action,
    actionValue: row.action_value || "",
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function listRules() {
  return getDb().prepare("SELECT * FROM mail_rules WHERE is_deleted = 0 ORDER BY datetime(created_at) ASC").all().map(rowToRule);
}

function saveRule(rule = {}) {
  const allowedFields = new Set(["from", "subject", "to"]);
  const allowedOperators = new Set(["contains", "equals", "ends_with"]);
  const allowedActions = new Set(["archive", "star", "read", "trash", "move_to_folder"]);
  const field = String(rule.field || "");
  const operator = String(rule.operator || "");
  const action = String(rule.action || "");
  const value = String(rule.value || "").trim();
  const actionValue = String(rule.actionValue || "").trim();
  if (!allowedFields.has(field) || !allowedOperators.has(operator) || !allowedActions.has(action) || !value || (action === "move_to_folder" && !actionValue)) {
    throw new Error("Règle invalide.");
  }
  const db = getDb();
  const id = String(rule.id || randomUUID());
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT created_at FROM mail_rules WHERE id = ?").get(id);
  const fieldLabel = field === "from" ? "Expéditeur" : field === "subject" ? "Objet" : "Destinataire";
  const operatorLabel = operator === "contains" ? "contient" : operator === "equals" ? "est" : "se termine par";
  db.prepare(`
    INSERT INTO mail_rules (id, name, field, operator, value, action, action_value, enabled, is_deleted, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      field = excluded.field,
      operator = excluded.operator,
      value = excluded.value,
      action = excluded.action,
      action_value = excluded.action_value,
      enabled = excluded.enabled,
      is_deleted = 0,
      updated_at = excluded.updated_at
  `).run(
    id,
    String(rule.name || "").trim() || `${fieldLabel} ${operatorLabel} ${value}`,
    field,
    operator,
    value,
    action,
    actionValue || null,
    Number(rule.enabled !== false),
    existing?.created_at || now,
    now,
  );
  return rowToRule(db.prepare("SELECT * FROM mail_rules WHERE id = ?").get(id));
}

function deleteRule(id) {
  getDb().prepare("UPDATE mail_rules SET is_deleted = 1, updated_at = ? WHERE id = ?")
    .run(new Date().toISOString(), String(id));
  return true;
}

function ruleMatches(rule, row) {
  const right = String(rule.value || "").trim().toLowerCase();
  let values = [];

  if (rule.field === "subject") {
    values = [String(row.subject || "").trim().toLowerCase()];
  } else if (rule.field === "from") {
    const raw = String(row.from_addr || "").trim().toLowerCase();
    const email = parseContactAddress(row.from_addr)?.email || "";
    values = [...new Set([raw, email].filter(Boolean))];
  } else {
    const addresses = [
      ...parse(row.to_json),
      ...parse(row.cc_json),
      ...parse(row.bcc_json),
    ];
    values = addresses.flatMap((address) => {
      const raw = String(address || "").trim().toLowerCase();
      const email = parseContactAddress(address)?.email || "";
      return [...new Set([raw, email].filter(Boolean))];
    });
  }

  if (rule.operator === "equals") return values.some((value) => value === right);
  if (rule.operator === "ends_with") return values.some((value) => value.endsWith(right));
  return values.some((value) => value.includes(right));
}

function applyRulesToMessage(db, id) {
  const row = db.prepare("SELECT * FROM messages WHERE id = ? AND direction = 'inbound'").get(String(id));
  if (!row) return false;
  const rules = db.prepare("SELECT * FROM mail_rules WHERE enabled = 1 AND is_deleted = 0 ORDER BY datetime(created_at) ASC").all();
  let changed = false;
  for (const rule of rules) {
    if (!ruleMatches(rule, row)) continue;
    if (rule.action === "archive") row.folder = "archive";
    if (rule.action === "trash") row.folder = "trash";
    if (rule.action === "star") row.is_starred = 1;
    if (rule.action === "read") row.is_read = 1;
    if (rule.action === "move_to_folder" && rule.action_value) row.folder = `custom:${rule.action_value}`;
    changed = true;
  }
  if (!changed) return false;
  db.prepare(`
    UPDATE messages
    SET folder = ?, is_read = ?, is_starred = ?, updated_at = ?, synced_at = NULL
    WHERE id = ?
  `).run(row.folder, row.is_read, row.is_starred, new Date().toISOString(), String(id));
  return true;
}

function runRulesOnInbox() {
  const db = getDb();
  const ids = db.prepare("SELECT id FROM messages WHERE direction = 'inbound' AND is_deleted = 0").all();
  let matched = 0;
  db.exec("BEGIN");
  try {
    for (const row of ids) {
      if (applyRulesToMessage(db, row.id)) matched += 1;
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { matched, snapshot: getSnapshot() };
}

function listBlockedSenders() {
  return getDb().prepare("SELECT email, created_at FROM blocked_senders ORDER BY datetime(created_at) DESC").all()
    .map((row) => ({ email: row.email, createdAt: row.created_at }));
}

function isBlockedSender(db, from) {
  const email = parseContactAddress(from)?.email;
  if (!email) return false;
  return Boolean(db.prepare("SELECT 1 FROM blocked_senders WHERE email = ?").get(email));
}

function blockSender(from) {
  const parsed = parseContactAddress(from);
  if (!parsed) throw new Error("Adresse expéditeur invalide.");
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare("INSERT INTO blocked_senders (email, created_at) VALUES (?, ?) ON CONFLICT(email) DO NOTHING")
    .run(parsed.email, now);
  db.prepare(`
    UPDATE messages
    SET folder = 'junk', snoozed_until = NULL, updated_at = ?, synced_at = NULL
    WHERE direction = 'inbound'
      AND lower(from_addr) LIKE ?
      AND folder <> 'trash'
      AND is_deleted = 0
  `).run(now, `%${parsed.email}%`);
  return { email: parsed.email, createdAt: now };
}

function unblockSender(email) {
  getDb().prepare("DELETE FROM blocked_senders WHERE email = ?").run(String(email || "").trim().toLowerCase());
  return true;
}

function rowToMail(row) {
  if (!row) return null;
  return {
    id: row.id,
    direction: row.direction,
    created_at: row.created_at || undefined,
    from: row.from_addr || undefined,
    to: parse(row.to_json),
    cc: parse(row.cc_json),
    bcc: parse(row.bcc_json),
    reply_to: parse(row.reply_to_json),
    subject: row.subject || undefined,
    message_id: row.message_id || undefined,
    headers: parse(row.headers_json, {}),
    in_reply_to: row.parent_message_id || undefined,
    references: parse(row.references_json),
    html: row.html,
    text: row.text_body,
    attachments: parse(row.attachments_json),
    localFolder: row.folder,
    localRead: Boolean(row.is_read),
    localStarred: Boolean(row.is_starred),
    localFlagged: Boolean(row.is_flagged),
    localPinned: Boolean(row.is_pinned),
    localDeleted: Boolean(row.is_deleted),
    category: row.category || undefined,
    snoozedUntil: row.snoozed_until || undefined,
    localUpdatedAt: row.updated_at,
  };
}

function indexMessage(db, id) {
  const messageId = String(id);
  db.prepare("DELETE FROM messages_fts WHERE id = ?").run(messageId);
  db.prepare(`
    INSERT INTO messages_fts (id, subject, sender, recipients, body, attachments)
    SELECT
      id,
      COALESCE(subject, ''),
      COALESCE(from_addr, ''),
      COALESCE(to_json, '') || ' ' || COALESCE(cc_json, '') || ' ' || COALESCE(bcc_json, ''),
      COALESCE(text_body, '') || ' ' || COALESCE(html, ''),
      COALESCE(attachments_json, '')
    FROM messages
    WHERE id = ? AND is_deleted = 0
  `).run(messageId);
}

function ftsQuery(value) {
  const terms = String(value || "")
    .normalize("NFKC")
    .match(/[\p{L}\p{N}@._+\-]+/gu) || [];
  return terms
    .slice(0, 12)
    .map((term) => `"${term.replace(/"/g, '""')}"*`)
    .join(" AND ");
}

function stripSearchQuotes(value) {
  const raw = String(value || "").trim();
  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) return raw.slice(1, -1);
  return raw;
}

function parseAdvancedSearch(value) {
  const tokens = String(value || "").match(/(?:[^\s"]+:"[^"]*"|"[^"]*"|\S+)/g) || [];
  const filters = [];
  const free = [];
  const supported = new Set(["from", "to", "subject", "has", "before", "after", "is", "category", "folder"]);

  for (const token of tokens) {
    const separator = token.indexOf(":");
    if (separator > 0) {
      const key = token.slice(0, separator).toLowerCase();
      const rawValue = stripSearchQuotes(token.slice(separator + 1));
      if (supported.has(key) && rawValue) {
        filters.push({ key, value: rawValue });
        continue;
      }
    }
    free.push(stripSearchQuotes(token));
  }

  return { filters, free: free.filter(Boolean) };
}

function searchDateBoundary(value, endOfDay = false) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const suffix = endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z";
  const date = new Date(`${raw}${suffix}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function searchLocalMessages(value, limit = 100) {
  const { filters, free } = parseAdvancedSearch(value);
  const freeQuery = ftsQuery(free.join(" "));
  if (!freeQuery && filters.length === 0) return [];

  const joins = freeQuery
    ? "FROM messages_fts JOIN messages m ON m.id = messages_fts.id"
    : "FROM messages m";
  const clauses = ["m.is_deleted = 0"];
  const params = [];

  if (freeQuery) {
    clauses.push("messages_fts MATCH ?");
    params.push(freeQuery);
  }

  for (const filter of filters) {
    const needle = `%${filter.value.toLowerCase()}%`;
    if (filter.key === "from") {
      clauses.push("lower(COALESCE(m.from_addr, '')) LIKE ?");
      params.push(needle);
    } else if (filter.key === "to") {
      clauses.push("lower(COALESCE(m.to_json, '') || ' ' || COALESCE(m.cc_json, '') || ' ' || COALESCE(m.bcc_json, '')) LIKE ?");
      params.push(needle);
    } else if (filter.key === "subject") {
      clauses.push("lower(COALESCE(m.subject, '')) LIKE ?");
      params.push(needle);
    } else if (filter.key === "has" && filter.value.toLowerCase() === "attachment") {
      clauses.push("COALESCE(m.attachments_json, '[]') <> '[]'");
    } else if (filter.key === "before") {
      const boundary = searchDateBoundary(filter.value, true);
      if (boundary) {
        clauses.push("datetime(m.created_at) <= datetime(?)");
        params.push(boundary);
      }
    } else if (filter.key === "after") {
      const boundary = searchDateBoundary(filter.value, false);
      if (boundary) {
        clauses.push("datetime(m.created_at) >= datetime(?)");
        params.push(boundary);
      }
    } else if (filter.key === "is") {
      const state = filter.value.toLowerCase();
      if (state === "unread") clauses.push("m.is_read = 0");
      if (state === "read") clauses.push("m.is_read = 1");
      if (state === "starred") clauses.push("m.is_starred = 1");
      if (state === "flagged") clauses.push("m.is_flagged = 1");
      if (state === "pinned") clauses.push("m.is_pinned = 1");
      if (state === "inbound") clauses.push("m.direction = 'inbound'");
      if (state === "outbound") clauses.push("m.direction = 'outbound'");
    } else if (filter.key === "category") {
      clauses.push("lower(COALESCE(m.category, '')) = ?");
      params.push(filter.value.toLowerCase());
    } else if (filter.key === "folder") {
      const folderValue = filter.value.toLowerCase();
      const custom = getDb().prepare("SELECT id FROM custom_folders WHERE lower(name) = ?").get(folderValue);
      clauses.push("lower(COALESCE(m.folder, '')) = ?");
      params.push(custom ? `custom:${custom.id}` : folderValue);
    }
  }

  params.push(Math.max(1, Math.min(250, Number(limit) || 100)));
  const order = freeQuery ? "bm25(messages_fts), datetime(m.created_at) DESC" : "datetime(m.created_at) DESC";
  const rows = getDb().prepare(`
    SELECT m.*
    ${joins}
    WHERE ${clauses.join("\n      AND ")}
    ORDER BY ${order}
    LIMIT ?
  `).all(...params);
  return rows.map(rowToMail);
}

function upsertMail(mail, direction) {
  if (!mail?.id) return;
  const db = getDb();
  const now = new Date().toISOString();
  const existed = Boolean(db.prepare("SELECT 1 FROM messages WHERE id = ?").get(String(mail.id)));
  const folder = direction === "outbound" ? "sent" : "inbox";
  const isRead = direction === "outbound" ? 1 : 0;
  const threading = threadMetadata(mail);
  db.prepare(`
    INSERT INTO messages (
      id, direction, created_at, from_addr, to_json, cc_json, bcc_json, reply_to_json,
      subject, message_id, headers_json, parent_message_id, references_json,
      html, text_body, attachments_json, remote_payload,
      folder, is_read, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      direction = excluded.direction,
      created_at = COALESCE(excluded.created_at, messages.created_at),
      from_addr = COALESCE(excluded.from_addr, messages.from_addr),
      to_json = CASE WHEN excluded.to_json <> '[]' THEN excluded.to_json ELSE messages.to_json END,
      cc_json = CASE WHEN excluded.cc_json <> '[]' THEN excluded.cc_json ELSE messages.cc_json END,
      bcc_json = CASE WHEN excluded.bcc_json <> '[]' THEN excluded.bcc_json ELSE messages.bcc_json END,
      reply_to_json = CASE WHEN excluded.reply_to_json <> '[]' THEN excluded.reply_to_json ELSE messages.reply_to_json END,
      subject = COALESCE(excluded.subject, messages.subject),
      message_id = COALESCE(excluded.message_id, messages.message_id),
      headers_json = CASE WHEN excluded.headers_json <> '{}' THEN excluded.headers_json ELSE messages.headers_json END,
      parent_message_id = COALESCE(excluded.parent_message_id, messages.parent_message_id),
      references_json = CASE WHEN excluded.references_json <> '[]' THEN excluded.references_json ELSE messages.references_json END,
      html = COALESCE(excluded.html, messages.html),
      text_body = COALESCE(excluded.text_body, messages.text_body),
      attachments_json = CASE WHEN excluded.attachments_json <> '[]' THEN excluded.attachments_json ELSE messages.attachments_json END,
      remote_payload = excluded.remote_payload,
      updated_at = excluded.updated_at
  `).run(
    String(mail.id),
    direction,
    mail.created_at || null,
    mail.from || null,
    json(mail.to),
    json(mail.cc),
    json(mail.bcc),
    json(mail.reply_to),
    mail.subject || null,
    mail.message_id || null,
    json(threading.headers, {}),
    threading.parent,
    json(threading.references),
    mail.html ?? null,
    mail.text ?? null,
    json(mail.attachments),
    json(mail, {}),
    folder,
    isRead,
    now,
  );
  indexMessage(db, mail.id);
  if (!existed) {
    learnContactsFromMail(db, mail, direction);
    if (direction === "inbound") {
      applyRulesToMessage(db, mail.id);
      if (isBlockedSender(db, mail.from)) {
        db.prepare(`
          UPDATE messages
          SET folder = 'junk', snoozed_until = NULL, updated_at = ?, synced_at = NULL
          WHERE id = ?
        `).run(new Date().toISOString(), String(mail.id));
      }
    }
  }
}

function upsertMany(items, direction) {
  const db = getDb();
  db.exec("BEGIN");
  try {
    for (const item of items || []) upsertMail(item, direction);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return getSnapshot();
}

function updateState(id, patch = {}) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(String(id));
  if (!row) return null;

  const folder = typeof patch.folder === "string" ? patch.folder : row.folder;
  const isRead = typeof patch.isRead === "boolean" ? Number(patch.isRead) : row.is_read;
  const isStarred = typeof patch.isStarred === "boolean" ? Number(patch.isStarred) : row.is_starred;
  const isFlagged = typeof patch.isFlagged === "boolean" ? Number(patch.isFlagged) : row.is_flagged;
  const isPinned = typeof patch.isPinned === "boolean" ? Number(patch.isPinned) : row.is_pinned;
  const isDeleted = typeof patch.isDeleted === "boolean" ? Number(patch.isDeleted) : row.is_deleted;
  const category = typeof patch.category === "string" ? (patch.category || null) : row.category;
  const snoozedUntil = typeof patch.snoozedUntil === "string" || patch.snoozedUntil === null
    ? patch.snoozedUntil
    : row.snoozed_until;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE messages
    SET folder = ?, is_read = ?, is_starred = ?, is_flagged = ?, is_pinned = ?, is_deleted = ?, category = ?, snoozed_until = ?, updated_at = ?, synced_at = NULL
    WHERE id = ?
  `).run(folder, isRead, isStarred, isFlagged, isPinned, isDeleted, category, snoozedUntil, now, String(id));
  indexMessage(db, id);
  return rowToMail(db.prepare("SELECT * FROM messages WHERE id = ?").get(String(id)));
}

function getLocalMail(id) {
  return rowToMail(getDb().prepare("SELECT * FROM messages WHERE id = ?").get(String(id)));
}

function getSnapshot() {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE messages
    SET folder = 'inbox', snoozed_until = NULL, updated_at = ?, synced_at = NULL
    WHERE folder = 'snoozed'
      AND snoozed_until IS NOT NULL
      AND snoozed_until <= ?
  `).run(now, now);

  const rows = db.prepare("SELECT * FROM messages WHERE is_deleted = 0 ORDER BY datetime(created_at) DESC").all();
  const states = db.prepare("SELECT id, folder, is_read, is_starred, is_flagged, is_pinned, is_deleted FROM messages").all();
  const missingBodies = db.prepare("SELECT id FROM messages WHERE direction = 'inbound' AND is_deleted = 0 AND html IS NULL AND text_body IS NULL").all();
  return {
    databasePath: databasePath(),
    messages: rows.map(rowToMail),
    missingBodyIds: missingBodies.map((row) => row.id),
    readIds: states.filter((row) => row.is_read).map((row) => row.id),
    starredIds: states.filter((row) => row.is_starred).map((row) => row.id),
    flaggedIds: states.filter((row) => row.is_flagged).map((row) => row.id),
    pinnedIds: states.filter((row) => row.is_pinned).map((row) => row.id),
    archivedIds: states.filter((row) => row.folder === "archive" && !row.is_deleted).map((row) => row.id),
    trashedIds: states.filter((row) => row.folder === "trash" && !row.is_deleted).map((row) => row.id),
    junkIds: states.filter((row) => row.folder === "junk" && !row.is_deleted).map((row) => row.id),
    snoozedIds: states.filter((row) => row.folder === "snoozed" && !row.is_deleted).map((row) => row.id),
    deletedIds: states.filter((row) => row.is_deleted).map((row) => row.id),
  };
}

function exportRows() {
  return getDb().prepare("SELECT * FROM messages").all().map((row) => ({
    id: row.id,
    direction: row.direction,
    created_at: row.created_at,
    from_addr: row.from_addr,
    to_json: parse(row.to_json),
    cc_json: parse(row.cc_json),
    bcc_json: parse(row.bcc_json),
    reply_to_json: parse(row.reply_to_json),
    subject: row.subject,
    message_id: row.message_id,
    headers_json: parse(row.headers_json, {}),
    parent_message_id: row.parent_message_id,
    references_json: parse(row.references_json),
    html: row.html,
    text_body: row.text_body,
    attachments_json: parse(row.attachments_json),
    folder: row.folder,
    is_read: Boolean(row.is_read),
    is_starred: Boolean(row.is_starred),
    is_flagged: Boolean(row.is_flagged),
    is_pinned: Boolean(row.is_pinned),
    is_deleted: Boolean(row.is_deleted),
    category: row.category || null,
    snoozed_until: row.snoozed_until || null,
    updated_at: row.updated_at,
  }));
}

function mergeRemoteRows(rows) {
  const db = getDb();
  const select = db.prepare("SELECT updated_at FROM messages WHERE id = ?");
  const upsert = db.prepare(`
    INSERT INTO messages (
      id, direction, created_at, from_addr, to_json, cc_json, bcc_json, reply_to_json,
      subject, message_id, headers_json, parent_message_id, references_json,
      html, text_body, attachments_json, folder, is_read, is_starred, is_flagged, is_pinned,
      is_deleted, category, snoozed_until, updated_at, synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      direction = excluded.direction,
      created_at = excluded.created_at,
      from_addr = excluded.from_addr,
      to_json = excluded.to_json,
      cc_json = excluded.cc_json,
      bcc_json = excluded.bcc_json,
      reply_to_json = excluded.reply_to_json,
      subject = excluded.subject,
      message_id = excluded.message_id,
      headers_json = excluded.headers_json,
      parent_message_id = excluded.parent_message_id,
      references_json = excluded.references_json,
      html = excluded.html,
      text_body = excluded.text_body,
      attachments_json = excluded.attachments_json,
      folder = excluded.folder,
      is_read = excluded.is_read,
      is_starred = excluded.is_starred,
      is_flagged = excluded.is_flagged,
      is_pinned = excluded.is_pinned,
      is_deleted = excluded.is_deleted,
      category = excluded.category,
      snoozed_until = excluded.snoozed_until,
      updated_at = excluded.updated_at,
      synced_at = excluded.synced_at
  `);

  db.exec("BEGIN");
  try {
    for (const row of rows || []) {
      if (!row?.id || !row?.updated_at) continue;
      const local = select.get(String(row.id));
      if (local?.updated_at && new Date(local.updated_at).getTime() >= new Date(row.updated_at).getTime()) continue;
      upsert.run(
        String(row.id),
        row.direction === "outbound" ? "outbound" : "inbound",
        row.created_at || null,
        row.from_addr || null,
        json(row.to_json),
        json(row.cc_json),
        json(row.bcc_json),
        json(row.reply_to_json),
        row.subject || null,
        row.message_id || null,
        json(row.headers_json, {}),
        row.parent_message_id || null,
        json(row.references_json),
        row.html ?? null,
        row.text_body ?? null,
        json(row.attachments_json),
        row.folder || (row.direction === "outbound" ? "sent" : "inbox"),
        Number(Boolean(row.is_read)),
        Number(Boolean(row.is_starred)),
        Number(Boolean(row.is_flagged)),
        Number(Boolean(row.is_pinned)),
        Number(Boolean(row.is_deleted)),
        row.category || null,
        row.snoozed_until || null,
        row.updated_at,
        new Date().toISOString(),
      );
      indexMessage(db, row.id);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return getSnapshot();
}

function markSynced() {
  getDb().prepare("UPDATE messages SET synced_at = ?").run(new Date().toISOString());
}

function exportContacts() {
  return getDb().prepare("SELECT * FROM contacts").all().map((row) => ({
    email: row.email,
    name: row.name || "",
    company: row.company || "",
    phone: row.phone || "",
    notes: row.notes || "",
    tags_json: parse(row.tags_json),
    times_seen: Number(row.times_seen || 0),
    last_seen_at: row.last_seen_at || null,
    is_favorite: Boolean(row.is_favorite),
    is_hidden: Boolean(row.is_hidden),
    source: row.source || "learned",
    updated_at: row.updated_at,
  }));
}

function mergeRemoteContacts(rows) {
  const db = getDb();
  const select = db.prepare("SELECT updated_at FROM contacts WHERE email = ?");
  const upsert = db.prepare(`
    INSERT INTO contacts (
      email, name, company, phone, notes, tags_json,
      times_seen, last_seen_at, is_favorite, is_hidden, source, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      name = excluded.name,
      company = excluded.company,
      phone = excluded.phone,
      notes = excluded.notes,
      tags_json = excluded.tags_json,
      times_seen = excluded.times_seen,
      last_seen_at = excluded.last_seen_at,
      is_favorite = excluded.is_favorite,
      is_hidden = excluded.is_hidden,
      source = excluded.source,
      updated_at = excluded.updated_at
  `);

  db.exec("BEGIN");
  try {
    for (const row of rows || []) {
      if (!row?.email || !row?.updated_at) continue;
      const local = select.get(String(row.email).toLowerCase());
      if (local?.updated_at && new Date(local.updated_at).getTime() >= new Date(row.updated_at).getTime()) continue;
      upsert.run(
        String(row.email).toLowerCase(),
        String(row.name || ""),
        String(row.company || ""),
        String(row.phone || ""),
        String(row.notes || ""),
        json(row.tags_json),
        Number(row.times_seen || 0),
        row.last_seen_at || null,
        Number(Boolean(row.is_favorite)),
        Number(Boolean(row.is_hidden)),
        row.source === "manual" ? "manual" : "learned",
        row.updated_at,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return listContacts();
}


function rowToTemplate(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    subject: row.subject || "",
    html: row.html || "",
    text: row.text_body || "",
    shortcut: row.shortcut || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function listTemplates() {
  return getDb().prepare("SELECT * FROM mail_templates WHERE is_deleted = 0 ORDER BY lower(name) ASC").all().map(rowToTemplate);
}

function saveTemplate(template = {}) {
  const db = getDb();
  const name = String(template.name || "").trim();
  if (!name) throw new Error("Le nom du modèle est requis.");
  const id = String(template.id || randomUUID());
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT created_at FROM mail_templates WHERE id = ?").get(id);
  db.prepare(`
    INSERT INTO mail_templates (
      id, name, subject, html, text_body, shortcut, is_deleted, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      subject = excluded.subject,
      html = excluded.html,
      text_body = excluded.text_body,
      shortcut = excluded.shortcut,
      is_deleted = 0,
      updated_at = excluded.updated_at
  `).run(
    id,
    name,
    String(template.subject || ""),
    String(template.html || ""),
    String(template.text || ""),
    String(template.shortcut || "").trim(),
    existing?.created_at || now,
    now,
  );
  return rowToTemplate(db.prepare("SELECT * FROM mail_templates WHERE id = ?").get(id));
}

function deleteTemplate(id) {
  getDb().prepare("UPDATE mail_templates SET is_deleted = 1, updated_at = ? WHERE id = ?")
    .run(new Date().toISOString(), String(id));
  return true;
}

function exportTemplates() {
  return getDb().prepare("SELECT * FROM mail_templates").all().map((row) => ({
    id: row.id,
    name: row.name,
    subject: row.subject || "",
    html: row.html || "",
    text_body: row.text_body || "",
    shortcut: row.shortcut || "",
    is_deleted: Boolean(row.is_deleted),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

function mergeRemoteTemplates(rows) {
  const db = getDb();
  const select = db.prepare("SELECT updated_at FROM mail_templates WHERE id = ?");
  const upsert = db.prepare(`
    INSERT INTO mail_templates (
      id, name, subject, html, text_body, shortcut, is_deleted, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      subject = excluded.subject,
      html = excluded.html,
      text_body = excluded.text_body,
      shortcut = excluded.shortcut,
      is_deleted = excluded.is_deleted,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  `);
  db.exec("BEGIN");
  try {
    for (const row of rows || []) {
      if (!row?.id || !row?.updated_at) continue;
      const local = select.get(String(row.id));
      if (local?.updated_at && new Date(local.updated_at).getTime() >= new Date(row.updated_at).getTime()) continue;
      upsert.run(
        String(row.id),
        String(row.name || "Modèle"),
        String(row.subject || ""),
        String(row.html || ""),
        String(row.text_body || ""),
        String(row.shortcut || ""),
        Number(Boolean(row.is_deleted)),
        row.created_at || row.updated_at,
        row.updated_at,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return listTemplates();
}

function rowToCalendarEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    location: row.location || "",
    startAt: row.start_at,
    endAt: row.end_at,
    allDay: Boolean(row.all_day),
    attendees: parse(row.attendees_json),
    sourceUid: row.source_uid || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function listCalendarEvents(from, to) {
  const db = getDb();
  const clauses = ["is_deleted = 0"];
  const params = [];
  if (from) {
    clauses.push("end_at >= ?");
    params.push(String(from));
  }
  if (to) {
    clauses.push("start_at <= ?");
    params.push(String(to));
  }
  return db.prepare(`
    SELECT * FROM calendar_events
    WHERE ${clauses.join(" AND ")}
    ORDER BY datetime(start_at) ASC, title ASC
  `).all(...params).map(rowToCalendarEvent);
}

function saveCalendarEvent(event = {}) {
  const db = getDb();
  const title = String(event.title || "").trim();
  if (!title) throw new Error("Le titre de l’événement est requis.");
  const start = new Date(event.startAt || "");
  const end = new Date(event.endAt || "");
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end.getTime() < start.getTime()) {
    throw new Error("Les dates de l’événement sont invalides.");
  }
  const id = String(event.id || randomUUID());
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT created_at FROM calendar_events WHERE id = ?").get(id);
  db.prepare(`
    INSERT INTO calendar_events (
      id, title, description, location, start_at, end_at, all_day, attendees_json,
      source_uid, is_deleted, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      location = excluded.location,
      start_at = excluded.start_at,
      end_at = excluded.end_at,
      all_day = excluded.all_day,
      attendees_json = excluded.attendees_json,
      source_uid = excluded.source_uid,
      is_deleted = 0,
      updated_at = excluded.updated_at
  `).run(
    id,
    title,
    String(event.description || ""),
    String(event.location || ""),
    start.toISOString(),
    end.toISOString(),
    Number(Boolean(event.allDay)),
    json(Array.isArray(event.attendees) ? event.attendees.map((item) => String(item).trim()).filter(Boolean) : []),
    String(event.sourceUid || "").trim() || null,
    existing?.created_at || now,
    now,
  );
  return rowToCalendarEvent(db.prepare("SELECT * FROM calendar_events WHERE id = ?").get(id));
}

function deleteCalendarEvent(id) {
  getDb().prepare("UPDATE calendar_events SET is_deleted = 1, updated_at = ? WHERE id = ?")
    .run(new Date().toISOString(), String(id));
  return true;
}

function exportCalendarEvents() {
  return getDb().prepare("SELECT * FROM calendar_events").all().map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description || "",
    location: row.location || "",
    start_at: row.start_at,
    end_at: row.end_at,
    all_day: Boolean(row.all_day),
    attendees_json: parse(row.attendees_json),
    source_uid: row.source_uid || null,
    is_deleted: Boolean(row.is_deleted),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

function mergeRemoteCalendarEvents(rows) {
  const db = getDb();
  const select = db.prepare("SELECT updated_at FROM calendar_events WHERE id = ?");
  const upsert = db.prepare(`
    INSERT INTO calendar_events (
      id, title, description, location, start_at, end_at, all_day, attendees_json,
      source_uid, is_deleted, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      location = excluded.location,
      start_at = excluded.start_at,
      end_at = excluded.end_at,
      all_day = excluded.all_day,
      attendees_json = excluded.attendees_json,
      source_uid = excluded.source_uid,
      is_deleted = excluded.is_deleted,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  `);
  db.exec("BEGIN");
  try {
    for (const row of rows || []) {
      if (!row?.id || !row?.updated_at || !row?.start_at || !row?.end_at) continue;
      const local = select.get(String(row.id));
      if (local?.updated_at && new Date(local.updated_at).getTime() >= new Date(row.updated_at).getTime()) continue;
      upsert.run(
        String(row.id),
        String(row.title || "Événement"),
        String(row.description || ""),
        String(row.location || ""),
        row.start_at,
        row.end_at,
        Number(Boolean(row.all_day)),
        json(row.attendees_json),
        row.source_uid || null,
        Number(Boolean(row.is_deleted)),
        row.created_at || row.updated_at,
        row.updated_at,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return listCalendarEvents();
}

function exportRules() {
  return getDb().prepare("SELECT * FROM mail_rules").all().map((row) => ({
    id: row.id,
    name: row.name,
    field: row.field,
    operator: row.operator,
    value: row.value,
    action: row.action,
    action_value: row.action_value || null,
    enabled: Boolean(row.enabled),
    is_deleted: Boolean(row.is_deleted),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

function mergeRemoteRules(rows) {
  const db = getDb();
  const select = db.prepare("SELECT updated_at FROM mail_rules WHERE id = ?");
  const upsert = db.prepare(`
    INSERT INTO mail_rules (id, name, field, operator, value, action, action_value, enabled, is_deleted, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      field = excluded.field,
      operator = excluded.operator,
      value = excluded.value,
      action = excluded.action,
      action_value = excluded.action_value,
      enabled = excluded.enabled,
      is_deleted = excluded.is_deleted,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  `);

  db.exec("BEGIN");
  try {
    for (const row of rows || []) {
      if (!row?.id || !row?.updated_at) continue;
      const local = select.get(String(row.id));
      if (local?.updated_at && new Date(local.updated_at).getTime() >= new Date(row.updated_at).getTime()) continue;
      upsert.run(
        String(row.id),
        String(row.name || "Règle"),
        String(row.field),
        String(row.operator),
        String(row.value || ""),
        String(row.action),
        row.action_value ? String(row.action_value) : null,
        Number(row.enabled !== false),
        Number(Boolean(row.is_deleted)),
        row.created_at || row.updated_at,
        row.updated_at,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return listRules();
}

function exportCustomFolders() {
  return getDb().prepare("SELECT * FROM custom_folders").all().map((row) => ({
    id: row.id,
    name: row.name,
    is_deleted: Boolean(row.is_deleted),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

function mergeRemoteCustomFolders(rows) {
  const db = getDb();
  const select = db.prepare("SELECT updated_at FROM custom_folders WHERE id = ?");
  const upsert = db.prepare(`
    INSERT INTO custom_folders (id, name, is_deleted, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      is_deleted = excluded.is_deleted,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  `);

  db.exec("BEGIN");
  try {
    for (const row of rows || []) {
      if (!row?.id || !row?.updated_at || !String(row.name || "").trim()) continue;
      const local = select.get(String(row.id));
      if (local?.updated_at && new Date(local.updated_at).getTime() >= new Date(row.updated_at).getTime()) continue;
      upsert.run(
        String(row.id),
        String(row.name).trim(),
        Number(Boolean(row.is_deleted)),
        row.created_at || row.updated_at,
        row.updated_at,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return listCustomFolders();
}

function rowToDraft(row) {
  if (!row) return null;
  return {
    id: row.id,
    from: row.from_addr || "",
    to: row.to_addr || "",
    cc: row.cc_addr || "",
    bcc: row.bcc_addr || "",
    subject: row.subject || "",
    text: row.text_body || "",
    html: row.html || "",
    replyToMessageId: row.reply_to_message_id || undefined,
    replyReferences: parse(row.reply_references_json),
    attachments: parse(row.attachments_json),
    updatedAt: row.updated_at,
  };
}

function listDrafts() {
  return getDb().prepare("SELECT * FROM drafts ORDER BY datetime(updated_at) DESC").all().map(rowToDraft);
}

function getDraft(id) {
  return rowToDraft(getDb().prepare("SELECT * FROM drafts WHERE id = ?").get(String(id)));
}

function saveDraft(draft = {}) {
  const db = getDb();
  const id = String(draft.id || randomUUID());
  const updatedAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO drafts (
      id, from_addr, to_addr, cc_addr, bcc_addr, subject, text_body, html,
      reply_to_message_id, reply_references_json, attachments_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      from_addr = excluded.from_addr,
      to_addr = excluded.to_addr,
      cc_addr = excluded.cc_addr,
      bcc_addr = excluded.bcc_addr,
      subject = excluded.subject,
      text_body = excluded.text_body,
      html = excluded.html,
      reply_to_message_id = excluded.reply_to_message_id,
      reply_references_json = excluded.reply_references_json,
      attachments_json = excluded.attachments_json,
      updated_at = excluded.updated_at
  `).run(
    id,
    String(draft.from || ""),
    String(draft.to || ""),
    String(draft.cc || ""),
    String(draft.bcc || ""),
    String(draft.subject || ""),
    String(draft.text || ""),
    String(draft.html || ""),
    draft.replyToMessageId ? String(draft.replyToMessageId) : null,
    json(draft.replyReferences),
    json(draft.attachments),
    updatedAt,
  );
  return getDraft(id);
}

function deleteDraft(id) {
  getDb().prepare("DELETE FROM drafts WHERE id = ?").run(String(id));
  return true;
}

// Compatibility bridge for older renderer builds.
function getActiveDraft() {
  return listDrafts()[0] || null;
}

function saveActiveDraft(draft = {}) {
  const current = getActiveDraft();
  return saveDraft({ ...draft, id: draft.id || current?.id || randomUUID() });
}

function deleteActiveDraft() {
  const current = getActiveDraft();
  if (current) deleteDraft(current.id);
  return true;
}

function rowToOutbox(row) {
  if (!row) return null;
  const payload = parse(row.payload_json, {});
  return {
    id: row.id,
    ...payload,
    status: row.status,
    attempts: Number(row.attempts || 0),
    lastError: row.last_error || "",
    nextAttemptAt: row.next_attempt_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function enqueueOutbox(payload = {}) {
  const db = getDb();
  const id = String(payload.outboxId || randomUUID());
  const now = new Date().toISOString();
  const requestedSendAt = payload.sendAt ? new Date(payload.sendAt) : null;
  const sendAt = requestedSendAt && Number.isFinite(requestedSendAt.getTime()) && requestedSendAt.getTime() > Date.now()
    ? requestedSendAt.toISOString()
    : now;
  const normalized = {
    ...payload,
    sendAt,
    idempotencyKey: payload.idempotencyKey || `maildesk/${id}`,
  };
  db.prepare(`
    INSERT INTO outbox (
      id, payload_json, status, attempts, last_error, next_attempt_at, created_at, updated_at
    ) VALUES (?, ?, 'pending', 0, NULL, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      payload_json = excluded.payload_json,
      status = 'pending',
      last_error = NULL,
      next_attempt_at = excluded.next_attempt_at,
      updated_at = excluded.updated_at
  `).run(id, json(normalized, {}), sendAt, now, now);
  return rowToOutbox(db.prepare("SELECT * FROM outbox WHERE id = ?").get(id));
}

function listOutbox() {
  return getDb().prepare("SELECT * FROM outbox ORDER BY datetime(created_at) DESC").all().map(rowToOutbox);
}

function getDueOutbox(limit = 10) {
  const now = new Date().toISOString();
  return getDb().prepare(`
    SELECT * FROM outbox
    WHERE status IN ('pending','failed')
      AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
    ORDER BY datetime(created_at) ASC
    LIMIT ?
  `).all(now, Number(limit)).map(rowToOutbox);
}

function getNextOutboxAttemptAt() {
  const row = getDb().prepare(`
    SELECT MIN(next_attempt_at) AS next_attempt_at
    FROM outbox
    WHERE status IN ('pending','failed') AND next_attempt_at IS NOT NULL
  `).get();
  return row?.next_attempt_at || null;
}

function markOutboxSending(id) {
  const now = new Date().toISOString();
  getDb().prepare("UPDATE outbox SET status = 'sending', updated_at = ? WHERE id = ?").run(now, String(id));
}

function markOutboxFailed(id, error, delaySeconds = 30) {
  const db = getDb();
  const row = db.prepare("SELECT attempts FROM outbox WHERE id = ?").get(String(id));
  const attempts = Number(row?.attempts || 0) + 1;
  const nextAttemptAt = new Date(Date.now() + Math.max(5, Number(delaySeconds)) * 1000).toISOString();
  db.prepare(`
    UPDATE outbox
    SET status = 'failed', attempts = ?, last_error = ?, next_attempt_at = ?, updated_at = ?
    WHERE id = ?
  `).run(attempts, String(error || "Envoi impossible"), nextAttemptAt, new Date().toISOString(), String(id));
}

function deleteOutbox(id) {
  getDb().prepare("DELETE FROM outbox WHERE id = ?").run(String(id));
  return true;
}

function retryOutbox(id) {
  const now = new Date().toISOString();
  getDb().prepare(`
    UPDATE outbox
    SET status = 'pending', next_attempt_at = ?, updated_at = ?
    WHERE id = ?
  `).run(now, now, String(id));
  return rowToOutbox(getDb().prepare("SELECT * FROM outbox WHERE id = ?").get(String(id)));
}

function resetSendingOutbox() {
  getDb().prepare("UPDATE outbox SET status = 'pending' WHERE status = 'sending'").run();
}

function createDatabaseBackup(targetPath) {
  const target = path.resolve(String(targetPath || ""));
  if (!target) throw new Error("Chemin de sauvegarde invalide.");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) fs.unlinkSync(target);

  const db = getDb();
  db.exec("PRAGMA wal_checkpoint(FULL);");
  const escaped = target.replace(/'/g, "''");
  db.exec(`VACUUM INTO '${escaped}'`);
  return target;
}

function restoreDatabaseBackup(sourcePath) {
  const source = path.resolve(String(sourcePath || ""));
  if (!source || !fs.existsSync(source)) throw new Error("Fichier de sauvegarde introuvable.");

  const probe = new DatabaseSync(source);
  try {
    const check = probe.prepare("PRAGMA quick_check").get();
    const result = check?.quick_check ?? Object.values(check || {})[0];
    if (String(result).toLowerCase() !== "ok") {
      throw new Error("La sauvegarde SQLite est endommagée.");
    }
    const tables = new Set(
      probe.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => String(row.name)),
    );
    if (!tables.has("messages") || !tables.has("drafts") || !tables.has("outbox")) {
      throw new Error("Ce fichier n'est pas une sauvegarde MailDesk compatible.");
    }
  } finally {
    probe.close();
  }

  const destination = databasePath();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safetyCopy = path.join(path.dirname(destination), `maildesk-pre-restore-${stamp}.db`);

  closeDatabase();
  try {
    if (fs.existsSync(destination)) fs.copyFileSync(destination, safetyCopy);
    for (const suffix of ["-wal", "-shm"]) {
      const sidecar = `${destination}${suffix}`;
      if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
    }
    fs.copyFileSync(source, destination);
    getDb();
    return { databasePath: destination, safetyCopy, snapshot: getSnapshot() };
  } catch (error) {
    closeDatabase();
    if (fs.existsSync(safetyCopy)) fs.copyFileSync(safetyCopy, destination);
    getDb();
    throw error;
  }
}

function closeDatabase() {
  if (!database) return;
  database.close();
  database = null;
}

module.exports = {
  blockSender,
  closeDatabase,
  createDatabaseBackup,
  databasePath,
  deleteActiveDraft,
  deleteCalendarEvent,
  deleteContact,
  deleteCustomFolder,
  deleteDraft,
  deleteTemplate,
  deleteOutbox,
  deleteRule,
  enqueueOutbox,
  exportCalendarEvents,
  exportContacts,
  exportCustomFolders,
  exportRows,
  exportRules,
  exportTemplates,
  getActiveDraft,
  getDraft,
  getDueOutbox,
  getLocalMail,
  getNextOutboxAttemptAt,
  getSnapshot,
  listBlockedSenders,
  listCalendarEvents,
  listContacts,
  listCustomFolders,
  listDrafts,
  listOutbox,
  listRules,
  listTemplates,
  markOutboxFailed,
  markOutboxSending,
  markSynced,
  mergeRemoteCalendarEvents,
  mergeRemoteContacts,
  mergeRemoteCustomFolders,
  mergeRemoteRows,
  mergeRemoteRules,
  mergeRemoteTemplates,
  resetSendingOutbox,
  restoreDatabaseBackup,
  retryOutbox,
  runRulesOnInbox,
  saveActiveDraft,
  saveCalendarEvent,
  saveContact,
  saveCustomFolder,
  saveDraft,
  saveRule,
  saveTemplate,
  searchContacts,
  searchLocalMessages,
  unblockSender,
  updateState,
  upsertMail,
  upsertMany,
};
