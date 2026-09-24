import { NextRequest, NextResponse } from "next/server";

type RemoteUser = {
  id: string;
  email?: string;
};

function isHostedMode() {
  if (process.env.MAILDESK_REQUIRE_REMOTE_AUTH === "0") return false;
  return process.env.MAILDESK_REQUIRE_REMOTE_AUTH === "1" || process.env.VERCEL === "1";
}

function allowedValues(name: string) {
  return new Set(
    String(process.env[name] || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function authorizeMailRequest(request: NextRequest | Request) {
  if (!isHostedMode()) {
    return { ok: true as const, user: null };
  }

  const supabaseUrl = String(
    process.env.NEXT_PUBLIC_SUPABASE_URL
      || process.env.SUPABASE_URL
      || "",
  ).replace(/\/$/, "");
  const anonKey = String(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      || process.env.SUPABASE_PUBLISHABLE_KEY
      || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      || process.env.SUPABASE_ANON_KEY
      || "",
  ).trim();

  if (!supabaseUrl || !anonKey) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Mobile authentication is not configured on this MailDesk server." },
        { status: 503 },
      ),
    };
  }

  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Authentication required." }, { status: 401 }),
    };
  }

  let userResponse: Response;
  try {
    userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${match[1]}`,
      },
      cache: "no-store",
    });
  } catch {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Authentication service unavailable." }, { status: 503 }),
    };
  }

  if (!userResponse.ok) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Invalid or expired session." }, { status: 401 }),
    };
  }

  const user = await userResponse.json() as RemoteUser;
  const allowedEmails = allowedValues("MAILDESK_MOBILE_ALLOWED_EMAILS");
  const allowedUserIds = allowedValues("MAILDESK_MOBILE_ALLOWED_USER_IDS");

  if (!allowedEmails.size && !allowedUserIds.size) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "MailDesk mobile allowlist is not configured." },
        { status: 503 },
      ),
    };
  }

  const email = String(user.email || "").toLowerCase();
  const id = String(user.id || "").toLowerCase();
  if (!allowedEmails.has(email) && !allowedUserIds.has(id)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "This account is not allowed to use MailDesk mobile." }, { status: 403 }),
    };
  }

  return { ok: true as const, user };
}
