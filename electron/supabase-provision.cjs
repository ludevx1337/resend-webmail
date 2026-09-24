const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");
const { syncWithSupabase } = require("./sync.cjs");

const TABLE = "maildesk_messages";
const MANAGEMENT_BASE = "https://api.supabase.com";
const EDGE_FUNCTION_SLUG = "maildesk-api";

function projectRefFromSettings(settings) {
  const explicit = String(settings?.supabaseProjectRef || "").trim();
  if (explicit) return explicit;

  const rawUrl = String(settings?.supabaseUrl || "").trim();
  if (!rawUrl) return "";

  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    const match = host.match(/^([a-z0-9-]+)\.supabase\.co$/);
    return match?.[1] || "";
  } catch {
    return "";
  }
}

function schemaPath() {
  return path.join(app.getAppPath(), "supabase", "maildesk_messages.sql");
}

function readSchema() {
  return fs.readFileSync(schemaPath(), "utf8");
}

function edgeFunctionPath() {
  return path.join(app.getAppPath(), "supabase", "functions", EDGE_FUNCTION_SLUG, "index.ts");
}

function readEdgeFunction() {
  return fs.readFileSync(edgeFunctionPath(), "utf8");
}

function mobileEdgeApiUrl(settings) {
  const supabaseUrl = String(settings?.supabaseUrl || "").trim().replace(/\/$/, "");
  return supabaseUrl ? `${supabaseUrl}/functions/v1/${EDGE_FUNCTION_SLUG}` : "";
}

function authEmailFromSettings(settings) {
  const raw = String(settings?.supabaseAuthEmail || settings?.from || "").trim();
  const bracket = raw.match(/<([^<>\s]+@[^<>\s]+)>/);
  return String(bracket?.[1] || raw).trim().toLowerCase();
}

async function responseDetail(response) {
  try {
    const body = await response.json();
    return body?.message || body?.error || body?.hint || body?.details || JSON.stringify(body);
  } catch {
    return await response.text().catch(() => "");
  }
}

async function runSchema(settings) {
  const token = String(settings?.supabaseManagementToken || "").trim();
  const projectRef = projectRefFromSettings(settings);
  if (!token) throw new Error("Le token Supabase Management API est obligatoire pour créer les tables.");
  if (!projectRef) {
    throw new Error("Référence projet Supabase introuvable. Renseignez le Project Ref ou utilisez une URL https://<ref>.supabase.co.");
  }

  const response = await fetch(`${MANAGEMENT_BASE}/v1/projects/${encodeURIComponent(projectRef)}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      query: readSchema(),
      read_only: false,
    }),
  });

  if (!response.ok) {
    const detail = await responseDetail(response);
    if (response.status === 401) throw new Error("Token Supabase Management API invalide ou expiré.");
    if (response.status === 403) throw new Error("Le token Supabase n'a pas la permission database_write pour ce projet.");
    throw new Error(`Initialisation Supabase impossible (${response.status})${detail ? ` : ${detail}` : ""}`);
  }

  return { projectRef };
}

async function verifyDataApi(settings) {
  const url = String(settings?.supabaseUrl || "").trim().replace(/\/$/, "");
  const key = String(settings?.supabaseKey || "").trim();
  if (!url) throw new Error("L'URL Supabase est obligatoire.");
  if (!key) throw new Error("La clé de synchronisation Supabase est obligatoire.");

  const dataHeaders = {
    apikey: key,
    Accept: "application/json",
  };
  if (!key.startsWith("sb_")) {
    dataHeaders.Authorization = `Bearer ${key}`;
  }

  const response = await fetch(`${url}/rest/v1/${TABLE}?select=id&limit=1`, {
    headers: dataHeaders,
  });

  if (!response.ok) {
    const detail = await responseDetail(response);
    if (response.status === 401 || response.status === 403) {
      throw new Error("La table a été créée, mais la clé de synchronisation n'a pas les droits requis. Utilisez une clé service_role / secret de projet.");
    }
    throw new Error(`La Data API Supabase ne répond pas correctement (${response.status})${detail ? ` : ${detail}` : ""}`);
  }

  return true;
}


function decodeJwtRole(value) {
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

function isPublicClientKey(value) {
  const key = String(value || "").trim();
  if (!key) return false;
  if (key.startsWith("sb_publishable_")) return true;
  if (key.startsWith("sb_secret_")) return false;
  return decodeJwtRole(key) === "anon";
}

function extractApiKeyList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.api_keys)) return payload.api_keys;
  return [];
}

async function resolveMobilePublishableKey(settings) {
  const configured = String(settings?.supabaseKey || "").trim();
  if (isPublicClientKey(configured)) return configured;

  const token = String(settings?.supabaseManagementToken || "").trim();
  const projectRef = projectRefFromSettings(settings);
  if (!token) {
    throw new Error("Le token Supabase Management API est nécessaire pour récupérer automatiquement la clé publishable destinée au mobile.");
  }
  if (!projectRef) {
    throw new Error("Référence projet Supabase introuvable pour récupérer la clé publishable.");
  }

  const response = await fetch(
    `${MANAGEMENT_BASE}/v1/projects/${encodeURIComponent(projectRef)}/api-keys`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    const detail = await responseDetail(response);
    if (response.status === 401) throw new Error("Token Supabase Management API invalide ou expiré.");
    if (response.status === 403) {
      throw new Error("Le token Supabase n'a pas la permission api_gateway_keys_read nécessaire pour générer le QR mobile.");
    }
    throw new Error(`Impossible de récupérer la clé publishable Supabase (${response.status})${detail ? ` : ${detail}` : ""}`);
  }

  const keys = extractApiKeyList(await response.json());
  const publicEntry = keys.find((entry) => isPublicClientKey(entry?.api_key))
    || keys.find((entry) => String(entry?.type || "").toLowerCase() === "publishable")
    || keys.find((entry) => String(entry?.name || "").toLowerCase() === "anon");
  const value = String(publicEntry?.api_key || publicEntry?.key || publicEntry?.value || "").trim();

  if (!isPublicClientKey(value)) {
    throw new Error("Aucune clé Supabase publishable/anon n'a été trouvée pour ce projet. Créez une clé publishable dans Supabase puis réessayez.");
  }
  return value;
}

function getMobileProvisioningStatus(settings) {
  const supabaseUrl = String(settings?.supabaseUrl || "").trim().replace(/\/$/, "");
  const configuredKey = String(settings?.supabaseKey || "").trim();
  const managementToken = String(settings?.supabaseManagementToken || "").trim();
  const projectRef = projectRefFromSettings(settings);
  const apiUrl = mobileEdgeApiUrl(settings);

  if (!supabaseUrl) return { configured: false, reason: "URL Supabase manquante.", apiUrl: "" };
  if (!projectRef) return { configured: false, reason: "Project Ref Supabase introuvable.", apiUrl };
  if (isPublicClientKey(configuredKey)) {
    return { configured: true, projectRef, source: "public-key", apiUrl };
  }
  if (managementToken) {
    return { configured: true, projectRef, source: "management-token", apiUrl };
  }
  return {
    configured: false,
    reason: "Clé publishable/anon ou token Management API manquant pour générer le QR mobile.",
    apiUrl,
  };
}

async function getMobileProvisioning(settings) {
  const supabaseUrl = String(settings?.supabaseUrl || "").trim().replace(/\/$/, "");
  if (!supabaseUrl) throw new Error("L'URL Supabase est obligatoire pour générer le QR mobile.");

  const apiUrl = mobileEdgeApiUrl(settings);
  if (!apiUrl) {
    throw new Error("Impossible de calculer l’URL de l’Edge Function MailDesk.");
  }

  const publishableKey = await resolveMobilePublishableKey(settings);
  const payload = {
    type: "maildesk.mobile.provision",
    version: 1,
    supabaseUrl,
    supabasePublishableKey: publishableKey,
    apiUrl,
  };

  return {
    payload,
    encoded: JSON.stringify(payload),
    projectRef: projectRefFromSettings(settings),
    hasApiUrl: Boolean(apiUrl),
  };
}

async function deployMobileEdgeFunction(settings) {
  const token = String(settings?.supabaseManagementToken || "").trim();
  const projectRef = projectRefFromSettings(settings);
  if (!token) throw new Error("Le token Supabase Management API est obligatoire pour déployer l’Edge Function.");
  if (!projectRef) throw new Error("Référence projet Supabase introuvable.");

  const source = readEdgeFunction();
  const form = new FormData();
  form.append("metadata", JSON.stringify({
    name: "MailDesk Mobile API",
    entrypoint_path: "index.ts",
    verify_jwt: false,
  }));
  form.append("file", new Blob([source], { type: "application/typescript" }), "index.ts");

  const response = await fetch(
    `${MANAGEMENT_BASE}/v1/projects/${encodeURIComponent(projectRef)}/functions/deploy?slug=${encodeURIComponent(EDGE_FUNCTION_SLUG)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      body: form,
    },
  );

  if (!response.ok) {
    const detail = await responseDetail(response);
    if (response.status === 401) throw new Error("Token Supabase Management API invalide ou expiré.");
    if (response.status === 403) {
      throw new Error("Le token Supabase n’a pas la permission edge_functions_write nécessaire pour déployer l’API mobile.");
    }
    throw new Error(`Déploiement Edge impossible (${response.status})${detail ? ` : ${detail}` : ""}`);
  }

  const result = await response.json().catch(() => ({}));
  return {
    ok: true,
    slug: EDGE_FUNCTION_SLUG,
    projectRef,
    apiUrl: mobileEdgeApiUrl(settings),
    version: result?.version ?? null,
    status: result?.status || "ACTIVE",
    message: "Edge Function MailDesk créée / mise à jour.",
  };
}

async function initializeSupabase(settings) {
  const { projectRef } = await runSchema(settings);
  await verifyDataApi(settings);
  const sync = await syncWithSupabase(settings);
  return {
    ok: true,
    projectRef,
    table: TABLE,
    sync,
    message: `Supabase initialisé : table ${TABLE} prête et synchronisation active.`,
  };
}

module.exports = {
  deployMobileEdgeFunction,
  getMobileProvisioning,
  getMobileProvisioningStatus,
  initializeSupabase,
  mobileEdgeApiUrl,
  projectRefFromSettings,
  resolveMobilePublishableKey,
  verifyDataApi,
};
