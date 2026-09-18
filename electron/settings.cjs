const fs = require("node:fs");
const path = require("node:path");
const { app, safeStorage } = require("electron");

const SETTINGS_VERSION = 7;

function normalizeIdentities(value, legacyFrom = "", legacySignature = "") {
  const input = Array.isArray(value) ? value : [];
  const identities = input
    .map((item, index) => ({
      id: String(item?.id || `identity-${index + 1}`).trim(),
      name: String(item?.name || "").trim(),
      from: String(item?.from || "").trim(),
      signature: String(item?.signature || ""),
      isDefault: Boolean(item?.isDefault),
    }))
    .filter((item) => item.id && item.from);

  if (!identities.length && legacyFrom) {
    identities.push({
      id: "default",
      name: "Principal",
      from: String(legacyFrom).trim(),
      signature: String(legacySignature || ""),
      isDefault: true,
    });
  }

  if (identities.length && !identities.some((item) => item.isDefault)) {
    identities[0].isDefault = true;
  }

  let defaultSeen = false;
  return identities.map((item) => {
    if (!item.isDefault) return item;
    if (defaultSeen) return { ...item, isDefault: false };
    defaultSeen = true;
    return item;
  });
}

function normalizeThemeColor(value) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#0f6cbd";
}

function defaults() {
  return {
    from: "",
    apiKey: "",
    signature: "",
    identities: [],
    undoSendSeconds: 10,
    refreshIntervalSeconds: 60,
    themeColor: "#0f6cbd",
    supabaseUrl: "",
    supabaseKey: "",
    supabaseProjectRef: "",
    supabaseManagementToken: "",
    autoUpdateEnabled: false,
    updateManifestUrl: "",
  };
}

function settingsFile() {
  return path.join(app.getPath("userData"), "maildesk-settings.json");
}

function decryptAccountBlob(encoded) {
  if (!encoded || !safeStorage.isEncryptionAvailable()) return defaults();
  const plain = safeStorage.decryptString(Buffer.from(encoded, "base64"));
  const parsed = { ...defaults(), ...JSON.parse(plain) };
  return {
    ...parsed,
    identities: normalizeIdentities(parsed.identities, parsed.from, parsed.signature),
  };
}

function readStoredSettings() {
  try {
    const file = settingsFile();
    if (!fs.existsSync(file)) return defaults();
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));

    if (parsed.accountEncrypted) {
      return decryptAccountBlob(parsed.accountEncrypted);
    }

    // Compatibility with the first MailDesk settings format.
    let apiKey = "";
    if (parsed.apiKeyEncrypted && safeStorage.isEncryptionAvailable()) {
      apiKey = safeStorage.decryptString(Buffer.from(parsed.apiKeyEncrypted, "base64"));
    }
    const from = parsed.from || "";
    return {
      ...defaults(),
      from,
      apiKey,
      identities: normalizeIdentities([], from, ""),
    };
  } catch (error) {
    console.error("Unable to read MailDesk settings", error);
    return defaults();
  }
}

function effectiveSettings() {
  const stored = readStoredSettings();
  const fallbackFrom = stored.from || process.env.RESEND_FROM || "";
  const identities = normalizeIdentities(stored.identities, fallbackFrom, stored.signature);
  const defaultIdentity = identities.find((item) => item.isDefault) || identities[0];
  return {
    ...stored,
    identities,
    apiKey: stored.apiKey || process.env.RESEND_API_KEY || "",
    from: defaultIdentity?.from || fallbackFrom,
    signature: defaultIdentity?.signature ?? stored.signature ?? "",
    supabaseUrl: stored.supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "",
    supabaseKey: stored.supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_ANON_KEY || "",
    supabaseProjectRef: stored.supabaseProjectRef || process.env.SUPABASE_PROJECT_REF || "",
    supabaseManagementToken: stored.supabaseManagementToken || process.env.SUPABASE_ACCESS_TOKEN || "",
    autoUpdateEnabled: Boolean(stored.autoUpdateEnabled),
    updateManifestUrl: stored.updateManifestUrl || process.env.MAILDESK_UPDATE_MANIFEST_URL || "",
    refreshIntervalSeconds: Math.max(5, Math.min(3600, Number(stored.refreshIntervalSeconds ?? 60))),
    themeColor: normalizeThemeColor(stored.themeColor),
  };
}

function hasConfiguredAccount() {
  const current = effectiveSettings();
  return Boolean(current.apiKey && current.from);
}

function applyStoredSettings() {
  const stored = readStoredSettings();
  if (stored.apiKey) process.env.RESEND_API_KEY = stored.apiKey;
  if (stored.from) process.env.RESEND_FROM = stored.from;
  if (stored.supabaseUrl) process.env.SUPABASE_URL = stored.supabaseUrl;
  if (stored.supabaseKey) process.env.SUPABASE_SERVICE_ROLE_KEY = stored.supabaseKey;
  if (stored.supabaseProjectRef) process.env.SUPABASE_PROJECT_REF = stored.supabaseProjectRef;
  if (stored.supabaseManagementToken) process.env.SUPABASE_ACCESS_TOKEN = stored.supabaseManagementToken;
  return effectiveSettings();
}

function saveStoredSettings(input) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Le chiffrement sécurisé Windows n'est pas disponible sur cette session.");
  }

  const current = readStoredSettings();
  const requestedFrom = typeof input?.from === "string" ? input.from.trim() : current.from;
  const requestedSignature = typeof input?.signature === "string" ? input.signature : current.signature;
  const identities = Array.isArray(input?.identities)
    ? normalizeIdentities(input.identities, requestedFrom, requestedSignature)
    : normalizeIdentities(current.identities, requestedFrom, requestedSignature);
  const defaultIdentity = identities.find((item) => item.isDefault) || identities[0];

  const next = {
    from: defaultIdentity?.from || requestedFrom,
    apiKey: typeof input?.apiKey === "string" && input.apiKey.trim() ? input.apiKey.trim() : current.apiKey,
    signature: defaultIdentity?.signature ?? requestedSignature,
    identities,
    undoSendSeconds: typeof input?.undoSendSeconds === "number"
      ? Math.max(0, Math.min(30, Math.round(input.undoSendSeconds)))
      : Number(current.undoSendSeconds ?? 10),
    refreshIntervalSeconds: typeof input?.refreshIntervalSeconds === "number"
      ? Math.max(5, Math.min(3600, Math.round(input.refreshIntervalSeconds)))
      : Math.max(5, Math.min(3600, Number(current.refreshIntervalSeconds ?? 60))),
    themeColor: typeof input?.themeColor === "string"
      ? normalizeThemeColor(input.themeColor)
      : normalizeThemeColor(current.themeColor),
    supabaseUrl: typeof input?.supabaseUrl === "string" ? input.supabaseUrl.trim().replace(/\/$/, "") : current.supabaseUrl,
    supabaseKey: typeof input?.supabaseKey === "string" && input.supabaseKey.trim() ? input.supabaseKey.trim() : current.supabaseKey,
    supabaseProjectRef: typeof input?.supabaseProjectRef === "string" ? input.supabaseProjectRef.trim() : current.supabaseProjectRef,
    supabaseManagementToken: typeof input?.supabaseManagementToken === "string" && input.supabaseManagementToken.trim()
      ? input.supabaseManagementToken.trim()
      : current.supabaseManagementToken,
    autoUpdateEnabled: typeof input?.autoUpdateEnabled === "boolean"
      ? input.autoUpdateEnabled
      : Boolean(current.autoUpdateEnabled),
    updateManifestUrl: typeof input?.updateManifestUrl === "string"
      ? input.updateManifestUrl.trim()
      : current.updateManifestUrl,
  };

  if (!next.from || !next.identities.length) throw new Error("Au moins une identité d'envoi est obligatoire.");
  if (!next.apiKey) throw new Error("La clé API Resend est obligatoire.");

  const accountEncrypted = safeStorage.encryptString(JSON.stringify(next)).toString("base64");
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(
    settingsFile(),
    JSON.stringify({ version: SETTINGS_VERSION, accountEncrypted }, null, 2),
    "utf8",
  );

  process.env.RESEND_API_KEY = next.apiKey;
  process.env.RESEND_FROM = next.from;

  if (next.supabaseUrl) process.env.SUPABASE_URL = next.supabaseUrl;
  else delete process.env.SUPABASE_URL;

  if (next.supabaseKey) process.env.SUPABASE_SERVICE_ROLE_KEY = next.supabaseKey;
  else delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (next.supabaseProjectRef) process.env.SUPABASE_PROJECT_REF = next.supabaseProjectRef;
  else delete process.env.SUPABASE_PROJECT_REF;

  if (next.supabaseManagementToken) process.env.SUPABASE_ACCESS_TOKEN = next.supabaseManagementToken;
  else delete process.env.SUPABASE_ACCESS_TOKEN;

  return next;
}

function publicSettings() {
  const current = effectiveSettings();
  return {
    from: current.from,
    signature: current.signature,
    identities: current.identities,
    undoSendSeconds: Number(current.undoSendSeconds ?? 10),
    refreshIntervalSeconds: Math.max(5, Math.min(3600, Number(current.refreshIntervalSeconds ?? 60))),
    themeColor: normalizeThemeColor(current.themeColor),
    supabaseUrl: current.supabaseUrl,
    supabaseProjectRef: current.supabaseProjectRef,
    hasApiKey: Boolean(current.apiKey),
    hasSupabaseKey: Boolean(current.supabaseKey),
    hasSupabaseManagementToken: Boolean(current.supabaseManagementToken),
    autoUpdateEnabled: Boolean(current.autoUpdateEnabled),
    updateManifestUrl: current.updateManifestUrl || "",
  };
}

module.exports = {
  applyStoredSettings,
  effectiveSettings,
  hasConfiguredAccount,
  publicSettings,
  readStoredSettings,
  saveStoredSettings,
  settingsFile,
};
