const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");
const { syncWithSupabase } = require("./sync.cjs");

const TABLE = "maildesk_messages";
const MANAGEMENT_BASE = "https://api.supabase.com";

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
  initializeSupabase,
  projectRefFromSettings,
  verifyDataApi,
};
