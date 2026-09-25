type DenoRuntime = {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const deno = (globalThis as typeof globalThis & { Deno: DenoRuntime }).Deno;
const RESEND_BASE = "https://api.resend.com";
const FUNCTION_SLUG = "maildesk-api";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(data: unknown, status = 200, extra: HeadersInit = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extra,
    },
  });
}

function env(name: string) {
  return String(deno.env.get(name) || "").trim();
}

function splitCsv(value: string) {
  return new Set(
    value.split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

function publishableKey() {
  const direct = env("SUPABASE_PUBLISHABLE_KEY") || env("SUPABASE_ANON_KEY");
  if (direct) return direct;

  const raw = env("SUPABASE_PUBLISHABLE_KEYS");
  if (!raw) return "";
  try {
    const keys = JSON.parse(raw) as Record<string, string>;
    return String(keys.default || Object.values(keys)[0] || "").trim();
  } catch {
    return "";
  }
}

async function authorize(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+/i.test(authorization)) {
    return { ok: false as const, response: json({ error: "Authentication required." }, 401) };
  }

  const supabaseUrl = env("SUPABASE_URL").replace(/\/$/, "");
  const key = publishableKey();
  if (!supabaseUrl || !key) {
    return { ok: false as const, response: json({ error: "Supabase authentication is not configured." }, 503) };
  }

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: key, Authorization: authorization },
    });
  } catch {
    return { ok: false as const, response: json({ error: "Authentication service unavailable." }, 503) };
  }

  if (!response.ok) {
    return { ok: false as const, response: json({ error: "Invalid or expired session." }, 401) };
  }

  const user = await response.json() as {
    id?: string;
    email?: string;
    app_metadata?: Record<string, unknown>;
  };
  const emails = splitCsv(env("MAILDESK_MOBILE_ALLOWED_EMAILS"));
  const ids = splitCsv(env("MAILDESK_MOBILE_ALLOWED_USER_IDS"));
  const email = String(user.email || "").toLowerCase();
  const id = String(user.id || "").toLowerCase();
  const metadataAccess = user.app_metadata?.maildesk_access === true;

  if (!metadataAccess && !emails.has(email) && !ids.has(id)) {
    return { ok: false as const, response: json({ error: "This account is not allowed to use MailDesk mobile." }, 403) };
  }

  return { ok: true as const, user };
}

async function resend(path: string, init: RequestInit = {}) {
  const apiKey = env("RESEND_API_KEY");
  if (!apiKey) {
    return { ok: false, status: 503, data: { error: "RESEND_API_KEY is not configured on the Edge Function." } };
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${apiKey}`);
  headers.set("Accept", "application/json");
  if (init.body != null) headers.set("Content-Type", "application/json");

  const response = await fetch(`${RESEND_BASE}${path}`, { ...init, headers });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

function routePath(request: Request) {
  const pathname = new URL(request.url).pathname;
  const marker = `/${FUNCTION_SLUG}`;
  const index = pathname.indexOf(marker);
  if (index >= 0) return pathname.slice(index + marker.length) || "/";
  return pathname;
}

function headerValue(headers: Record<string, string> | null | undefined, name: string) {
  if (!headers) return "";
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return String(value || "");
  }
  return "";
}

function parseMessageIds(value: string) {
  const raw = value.trim();
  if (!raw) return [];
  const bracketed = raw.match(/<[^>]+>/g);
  if (bracketed?.length) return bracketed.map((item) => item.trim());
  return raw.split(/\s+/).map((item) => item.trim()).filter(Boolean);
}

function splitAddresses(value?: string) {
  return String(value || "")
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractInlineImages(html?: string) {
  const attachments: Array<Record<string, string>> = [];
  if (!html?.trim()) return { html: html?.trim() || undefined, attachments };

  let index = 0;
  const nextHtml = html.replace(
    /src=(["'])data:(image\/[a-z0-9.+-]+);base64,([^"']+)\1/gi,
    (_match, quote: string, contentType: string, content: string) => {
      index += 1;
      const subtype = contentType.split("/")[1]?.replace(/[^a-z0-9]+/gi, "") || "png";
      const contentId = `maildesk-signature-${index}@local`;
      attachments.push({
        filename: `signature-${index}.${subtype}`,
        content,
        content_type: contentType,
        content_id: contentId,
      });
      return `src=${quote}cid:${contentId}${quote}`;
    },
  );

  return { html: nextHtml.trim() || undefined, attachments };
}


function serviceRoleKey() {
  return env("SUPABASE_SERVICE_ROLE_KEY");
}

async function supabaseAdmin(path: string, init: RequestInit = {}) {
  const supabaseUrl = env("SUPABASE_URL").replace(/\/$/, "");
  const key = serviceRoleKey();
  if (!supabaseUrl || !key) {
    return { ok: false, status: 503, data: { error: "Supabase service role is not configured." } };
  }
  const headers = new Headers(init.headers);
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);
  headers.set("Accept", "application/json");
  if (init.body != null) headers.set("Content-Type", "application/json");
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

function base64SecretBytes(value: string) {
  const normalized = value.replace(/^whsec_/, "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function verifyResendWebhook(request: Request, rawBody: string) {
  const secret = env("RESEND_WEBHOOK_SECRET");
  if (!secret) return false;
  const id = request.headers.get("svix-id") || request.headers.get("webhook-id") || "";
  const timestamp = request.headers.get("svix-timestamp") || request.headers.get("webhook-timestamp") || "";
  const signatures = request.headers.get("svix-signature") || request.headers.get("webhook-signature") || "";
  if (!id || !timestamp || !signatures) return false;

  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(Date.now() / 1000 - seconds) > 5 * 60) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    base64SecretBytes(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`),
  );
  const expected = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return signatures.split(/\s+/).some((candidate) => candidate === `v1,${expected}`);
}

async function sendExpoPushForMail(mail: {
  id: string;
  from?: string;
  subject?: string;
}) {
  const tokens = await supabaseAdmin("maildesk_push_tokens?select=token&active=eq.true");
  if (!tokens.ok || !Array.isArray(tokens.data) || !tokens.data.length) return;

  const messages = tokens.data
    .map((row) => String(row?.token || "").trim())
    .filter((token) => token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken["))
    .map((to) => ({
      to,
      sound: "default",
      title: mail.from ? `Nouveau mail · ${mail.from}` : "Nouveau mail",
      body: mail.subject || "(Sans objet)",
      data: { mailId: mail.id, folder: "inbox", source: "resend" },
      channelId: "maildesk-mail",
    }));
  if (!messages.length) return;

  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messages),
  });
}

async function handleResendWebhook(request: Request) {
  const rawBody = await request.text();
  if (!await verifyResendWebhook(request, rawBody)) {
    return json({ error: "Invalid webhook signature." }, 401);
  }

  const event = JSON.parse(rawBody || "{}") as {
    type?: string;
    data?: {
      email_id?: string;
      created_at?: string;
      from?: string;
      to?: string[];
      cc?: string[];
      bcc?: string[];
      message_id?: string;
      subject?: string;
      attachments?: unknown[];
    };
  };
  if (event.type !== "email.received" || !event.data?.email_id) {
    return json({ ok: true, ignored: true });
  }

  const mail = event.data;
  const emailId = String(event.data.email_id);
  const row = {
    id: emailId,
    direction: "inbound",
    created_at: mail.created_at || new Date().toISOString(),
    from_addr: mail.from || null,
    to_json: mail.to || [],
    cc_json: mail.cc || [],
    bcc_json: mail.bcc || [],
    reply_to_json: [],
    subject: mail.subject || null,
    message_id: mail.message_id || null,
    headers_json: {},
    references_json: [],
    html: null,
    text_body: null,
    attachments_json: mail.attachments || [],
    folder: "inbox",
    is_read: false,
    is_starred: false,
    is_flagged: false,
    is_pinned: false,
    is_deleted: false,
    updated_at: mail.created_at || new Date().toISOString(),
  };

  const stored = await supabaseAdmin("maildesk_messages?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify([row]),
  });
  if (!stored.ok) {
    return json({ error: stored.data?.message || "Unable to store inbound mail." }, stored.status || 500);
  }
  if (Array.isArray(stored.data) && stored.data.length === 0) {
    return json({ ok: true, duplicate: true });
  }

  await sendExpoPushForMail({
    id: emailId,
    from: mail.from,
    subject: mail.subject,
  });
  return json({ ok: true });
}

async function syncedMobileProfile() {
  const result = await supabaseAdmin("maildesk_profile?id=eq.default&select=default_from,signature_html&limit=1");
  if (result.ok && Array.isArray(result.data) && result.data[0]) {
    return {
      defaultFrom: String(result.data[0].default_from || env("RESEND_FROM")),
      signatureHtml: String(result.data[0].signature_html || ""),
    };
  }
  return {
    defaultFrom: env("RESEND_FROM"),
    signatureHtml: env("MAILDESK_MOBILE_SIGNATURE_HTML"),
  };
}

async function handleMail(request: Request, path: string) {
  if (request.method === "GET" && path === "/api/mail/inbox") {
    const result = await resend("/emails/receiving?limit=100");
    if (!result.ok) return json({ error: result.data?.message || result.data?.error || "Unable to load inbox" }, result.status || 502);
    return json({ emails: result.data?.data ?? [] });
  }

  if (request.method === "GET" && path === "/api/mail/sent") {
    const result = await resend("/emails?limit=100");
    if (!result.ok) return json({ error: result.data?.message || result.data?.error || "Unable to load sent mail" }, result.status || 502);
    return json({ emails: result.data?.data ?? [] });
  }

  const attachmentMatch = path.match(/^\/api\/mail\/(inbox|sent)\/([^/]+)\/attachments\/([^/]+)$/);
  if (request.method === "GET" && attachmentMatch) {
    const [, folder, rawMailId, rawAttachmentId] = attachmentMatch;
    const mailId = decodeURIComponent(rawMailId);
    const attachmentId = decodeURIComponent(rawAttachmentId);
    const prefix = folder === "inbox" ? "/emails/receiving" : "/emails";
    const result = await resend(`${prefix}/${encodeURIComponent(mailId)}/attachments/${encodeURIComponent(attachmentId)}`);
    const url = result.data?.download_url;
    if (!result.ok || !url) return json({ error: result.data?.message || "Pièce jointe introuvable" }, result.status || 404);
    return json({ url });
  }

  const detailMatch = path.match(/^\/api\/mail\/(inbox|sent)\/([^/]+)$/);
  if (request.method === "GET" && detailMatch) {
    const [, folder, rawId] = detailMatch;
    const id = decodeURIComponent(rawId);
    const prefix = folder === "inbox" ? "/emails/receiving" : "/emails";
    const result = await resend(`${prefix}/${encodeURIComponent(id)}`);
    if (!result.ok) return json({ error: result.data?.message || "Unable to load email" }, result.status || 502);

    if (folder === "inbox" && result.data) {
      const headers = result.data.headers as Record<string, string> | null | undefined;
      return json({
        email: {
          ...result.data,
          in_reply_to: headerValue(headers, "in-reply-to") || undefined,
          references: parseMessageIds(headerValue(headers, "references")),
        },
      });
    }
    return json({ email: result.data });
  }

  if (request.method === "POST" && path === "/api/mail/send") {
    const body = await request.json().catch(() => ({})) as {
      from?: string;
      to?: string;
      cc?: string;
      bcc?: string;
      subject?: string;
      text?: string;
      html?: string;
      replyToMessageId?: string;
      replyReferences?: string[];
      idempotencyKey?: string;
      attachments?: Array<{ name?: string; content?: string; type?: string }>;
    };

    const to = splitAddresses(body.to);
    if (!to.length) return json({ error: "At least one recipient is required" }, 400);

    const inline = extractInlineImages(body.html);
    const attachments = [
      ...(body.attachments || [])
        .filter((item) => item.name && item.content)
        .map((item) => ({
          filename: item.name,
          content: item.content,
          content_type: item.type || undefined,
        })),
      ...inline.attachments,
    ];

    const references = [...new Set([
      ...(body.replyReferences || []),
      body.replyToMessageId,
    ].filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))];

    const payload = {
      from: body.from?.trim() || env("RESEND_FROM"),
      to,
      cc: splitAddresses(body.cc),
      bcc: splitAddresses(body.bcc),
      subject: body.subject?.trim() || "(Sans objet)",
      text: body.text?.trim() || " ",
      html: inline.html,
      headers: body.replyToMessageId ? {
        "In-Reply-To": body.replyToMessageId,
        References: references.join(" "),
      } : undefined,
      attachments,
    };

    if (!payload.from) return json({ error: "RESEND_FROM is not configured on the Edge Function." }, 503);

    const headers: Record<string, string> = {};
    if (body.idempotencyKey) headers["Idempotency-Key"] = body.idempotencyKey;
    const result = await resend("/emails", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    if (!result.ok) {
      return json({
        error: result.data?.message || result.data?.error || "Unable to send email",
        errorName: result.data?.name,
      }, result.status || 502);
    }
    return json({ ok: true, email: result.data });
  }

  return null;
}

deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const path = routePath(request);
  if (request.method === "POST" && path === "/webhooks/resend") {
    return handleResendWebhook(request);
  }

  const auth = await authorize(request);
  if (!auth.ok) return auth.response;

  if (request.method === "GET" && path === "/api/mobile/profile") {
    return json(await syncedMobileProfile());
  }

  const mailResponse = await handleMail(request, path);
  if (mailResponse) return mailResponse;

  return json({ error: "Route MailDesk Edge inconnue.", path }, 404);
});
