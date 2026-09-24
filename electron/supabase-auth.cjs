const crypto = require("node:crypto");

const MOBILE_PASSWORD_REDIRECT = "maildesk://auth/set-password";

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

function isSecretProjectKey(value) {
  const key = String(value || "").trim();
  if (!key) return false;
  if (key.startsWith("sb_secret_")) return true;
  return decodeJwtRole(key) === "service_role";
}

function normalizeEmail(value) {
  const raw = String(value || "").trim();
  const bracket = raw.match(/<([^<>\s]+@[^<>\s]+)>/);
  const email = String(bracket?.[1] || raw).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Adresse e-mail Supabase Auth invalide.");
  }
  return email;
}

function generatePassword(length = 24) {
  const groups = [
    "abcdefghijkmnopqrstuvwxyz",
    "ABCDEFGHJKLMNPQRSTUVWXYZ",
    "23456789",
    "!@#$%*-_=+",
  ];
  const all = groups.join("");
  const chars = groups.map((group) => group[crypto.randomInt(group.length)]);
  while (chars.length < length) chars.push(all[crypto.randomInt(all.length)]);
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swap = crypto.randomInt(index + 1);
    [chars[index], chars[swap]] = [chars[swap], chars[index]];
  }
  return chars.join("");
}

function authBase(settings) {
  const url = String(settings?.supabaseUrl || "").trim().replace(/\/$/, "");
  if (!url) throw new Error("L’URL Supabase est obligatoire.");
  return `${url}/auth/v1`;
}

function secretKey(settings) {
  const key = String(settings?.supabaseKey || "").trim();
  if (!isSecretProjectKey(key)) {
    throw new Error("Une clé Supabase secrète (sb_secret_… ou service_role) est nécessaire pour gérer les comptes mobiles.");
  }
  return key;
}

async function authRequest(settings, path, init = {}) {
  const key = secretKey(settings);
  const headers = new Headers(init.headers || {});
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);
  headers.set("Accept", "application/json");
  if (init.body != null) headers.set("Content-Type", "application/json");
  const response = await fetch(`${authBase(settings)}${path}`, { ...init, headers });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}


async function findUserByEmail(settings, email) {
  const perPage = 1000;
  for (let page = 1; page <= 10; page += 1) {
    const { response, body } = await authRequest(settings, `/admin/users?page=${page}&per_page=${perPage}`);
    if (!response.ok) {
      throw new Error(body?.message || body?.error_description || `Impossible de lire les utilisateurs Supabase Auth (${response.status}).`);
    }
    const users = Array.isArray(body?.users) ? body.users : Array.isArray(body) ? body : [];
    const match = users.find((user) => String(user?.email || "").trim().toLowerCase() === email);
    if (match) return match;
    if (users.length < perPage) break;
  }
  return null;
}

async function updateMobileAccess(settings, user, password = "") {
  const currentMetadata = user?.user_metadata && typeof user.user_metadata === "object"
    ? user.user_metadata
    : {};
  const { response, body } = await authRequest(settings, `/admin/users/${encodeURIComponent(user.id)}`, {
    method: "PUT",
    body: JSON.stringify({
      user_metadata: {
        ...currentMetadata,
        maildesk_access: true,
        maildesk_source: "desktop",
      },
      ...(password ? { password, email_confirm: true } : {}),
    }),
  });
  if (!response.ok) {
    throw new Error(body?.message || body?.error_description || `Impossible de mettre à jour le compte Supabase Auth (${response.status}).`);
  }
  return body?.user || body;
}

async function sendRecoveryEmail(settings, email) {
  const { response, body } = await authRequest(
    settings,
    `/recover?redirect_to=${encodeURIComponent(MOBILE_PASSWORD_REDIRECT)}`,
    {
      method: "POST",
      body: JSON.stringify({ email }),
    },
  );
  if (!response.ok) {
    throw new Error(body?.message || body?.error_description || `Impossible d’envoyer l’e-mail de création du mot de passe (${response.status}).`);
  }
}

async function createMobileAuthUser(settings, input = {}) {
  const email = normalizeEmail(input.email || settings?.supabaseAuthEmail || settings?.from);
  const mode = input.mode === "generated" ? "generated" : "invite";
  const existing = await findUserByEmail(settings, email);

  if (mode === "generated") {
    const password = generatePassword();
    let user = existing;

    if (existing?.id) {
      user = await updateMobileAccess(settings, existing, password);
    } else {
      const { response, body } = await authRequest(settings, "/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            maildesk_access: true,
            maildesk_source: "desktop",
          },
        }),
      });
      if (!response.ok) {
        throw new Error(body?.message || body?.error_description || `Impossible de créer le compte Supabase Auth (${response.status}).`);
      }
      user = body?.user || body;
    }

    return {
      ok: true,
      mode,
      email,
      userId: String(user?.id || existing?.id || ""),
      generatedPassword: password,
      existing: Boolean(existing),
      message: existing
        ? "Compte mobile existant lié à MailDesk et mot de passe régénéré."
        : "Compte mobile créé avec un mot de passe généré.",
    };
  }

  if (existing?.id) {
    await updateMobileAccess(settings, existing);
    await sendRecoveryEmail(settings, email);
    return {
      ok: true,
      mode,
      email,
      userId: String(existing.id),
      generatedPassword: "",
      existing: true,
      message: "Compte mobile existant lié à MailDesk. Un e-mail de définition du mot de passe a été envoyé.",
    };
  }

  const { response, body } = await authRequest(
    settings,
    `/invite?redirect_to=${encodeURIComponent(MOBILE_PASSWORD_REDIRECT)}`,
    {
      method: "POST",
      body: JSON.stringify({
        email,
        data: {
          maildesk_access: true,
          maildesk_source: "desktop",
        },
      }),
    },
  );
  if (!response.ok) {
    throw new Error(body?.message || body?.error_description || `Impossible d’envoyer l’invitation Supabase Auth (${response.status}).`);
  }

  const user = body?.user || body;
  return {
    ok: true,
    mode,
    email,
    userId: String(user?.id || ""),
    generatedPassword: "",
    existing: false,
    message: "Compte mobile créé. Supabase a envoyé l’e-mail permettant de définir le mot de passe.",
  };
}

module.exports = {
  MOBILE_PASSWORD_REDIRECT,
  createMobileAuthUser,
  generatePassword,
  normalizeEmail,
};
