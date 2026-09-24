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

  const auth = await authorize(request);
  if (!auth.ok) return auth.response;

  const path = routePath(request);
  if (request.method === "GET" && path === "/api/mobile/profile") {
    return json({
      defaultFrom: env("RESEND_FROM"),
      signatureHtml: env("MAILDESK_MOBILE_SIGNATURE_HTML"),
    });
  }

  const mailResponse = await handleMail(request, path);
  if (mailResponse) return mailResponse;

  return json({ error: "Route MailDesk Edge inconnue.", path }, 404);
});
