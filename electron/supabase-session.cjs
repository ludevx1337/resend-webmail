function normalizeSupabaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) throw new Error("L’URL ou le Project Ref Supabase est obligatoire.");
  const url = /^https?:\/\//i.test(raw)
    ? raw.replace(/\/$/, "")
    : `https://${raw}.supabase.co`;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !parsed.hostname) throw new Error();
    return parsed.origin;
  } catch {
    throw new Error("URL / Project Ref Supabase invalide.");
  }
}

function projectRefFromUrl(value) {
  try {
    const host = new URL(normalizeSupabaseUrl(value)).hostname;
    return host.endsWith(".supabase.co") ? host.slice(0, -".supabase.co".length) : "";
  } catch {
    return "";
  }
}

function normalizePublishableKey(value) {
  const key = String(value || "").trim();
  if (!key) throw new Error("La clé publishable / anon Supabase est obligatoire.");
  if (key.startsWith("sb_secret_")) {
    throw new Error("Utilisez une clé publishable (sb_publishable_…), pas une clé secrète.");
  }
  return key;
}

async function jsonBody(response) {
  const body = await response.json().catch(async () => {
    const text = await response.text().catch(() => "");
    return text ? { message: text } : {};
  });
  return body || {};
}

function authError(body, status, fallback) {
  const message = String(
    body?.msg
    || body?.message
    || body?.error_description
    || body?.error
    || "",
  ).trim();
  if (status === 400 && /invalid login credentials/i.test(message)) {
    return new Error("E-mail ou mot de passe Supabase incorrect.");
  }
  if (status === 429) {
    return new Error("Trop de tentatives de connexion Supabase. Réessayez dans quelques instants.");
  }
  return new Error(message || fallback || `Erreur Supabase Auth (${status}).`);
}

function sessionResult(url, publishableKey, body) {
  const accessToken = String(body?.access_token || "").trim();
  const refreshToken = String(body?.refresh_token || "").trim();
  const user = body?.user && typeof body.user === "object" ? body.user : null;
  if (!accessToken || !refreshToken || !user?.id) {
    throw new Error("Supabase Auth n’a pas retourné de session utilisateur complète.");
  }
  const expiresAt = Number(body?.expires_at || 0)
    || Math.floor(Date.now() / 1000) + Math.max(60, Number(body?.expires_in || 3600));

  return {
    supabaseUrl: url,
    supabasePublishableKey: publishableKey,
    supabaseProjectRef: projectRefFromUrl(url),
    supabaseAuthAccessToken: accessToken,
    supabaseAuthRefreshToken: refreshToken,
    supabaseAuthExpiresAt: expiresAt,
    supabaseAuthEmail: String(user.email || "").trim().toLowerCase(),
    supabaseAuthUserId: String(user.id || ""),
    user,
  };
}

async function signInSupabaseUser(input = {}) {
  const url = normalizeSupabaseUrl(input.supabaseUrl || input.projectRef);
  const publishableKey = normalizePublishableKey(input.supabasePublishableKey || input.publishableKey);
  const email = String(input.email || "").trim().toLowerCase();
  const password = String(input.password || "");
  if (!email) throw new Error("L’adresse e-mail Supabase est obligatoire.");
  if (!password) throw new Error("Le mot de passe Supabase est obligatoire.");

  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const body = await jsonBody(response);
  if (!response.ok) throw authError(body, response.status, "Connexion Supabase impossible.");

  const result = sessionResult(url, publishableKey, body);
  if (result.user?.app_metadata?.maildesk_access !== true) {
    throw new Error(
      "Connexion Supabase réussie, mais ce compte n’est pas autorisé pour MailDesk. "
      + "Depuis un MailDesk déjà lié, ouvrez Paramètres > Supabase puis « Créer / lier le compte mobile ».",
    );
  }
  return result;
}

async function refreshSupabaseUserSession(settings = {}, options = {}) {
  const url = normalizeSupabaseUrl(settings.supabaseUrl);
  const publishableKey = normalizePublishableKey(
    settings.supabasePublishableKey || settings.supabaseKey,
  );
  const accessToken = String(settings.supabaseAuthAccessToken || "").trim();
  const refreshToken = String(settings.supabaseAuthRefreshToken || "").trim();
  const expiresAt = Number(settings.supabaseAuthExpiresAt || 0);
  const marginSeconds = Math.max(30, Number(options.marginSeconds || 120));

  if (accessToken && expiresAt > Math.floor(Date.now() / 1000) + marginSeconds) {
    return {
      ...settings,
      supabaseUrl: url,
      supabasePublishableKey: publishableKey,
      refreshed: false,
    };
  }
  if (!refreshToken) {
    return {
      ...settings,
      supabaseUrl: url,
      supabasePublishableKey: publishableKey,
      refreshed: false,
    };
  }

  const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const body = await jsonBody(response);
  if (!response.ok) {
    throw authError(
      body,
      response.status,
      "La session Supabase a expiré. Reconnectez l’espace MailDesk.",
    );
  }

  const refreshed = sessionResult(url, publishableKey, body);
  if (refreshed.user?.app_metadata?.maildesk_access !== true) {
    throw new Error("Le compte Supabase n’a plus l’autorisation MailDesk.");
  }
  return {
    ...settings,
    ...refreshed,
    refreshed: true,
  };
}

module.exports = {
  normalizePublishableKey,
  normalizeSupabaseUrl,
  projectRefFromUrl,
  refreshSupabaseUserSession,
  signInSupabaseUser,
};
