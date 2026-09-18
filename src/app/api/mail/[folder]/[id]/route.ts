import { NextRequest, NextResponse } from "next/server";
import { getResend } from "@/lib/resend";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ folder: string; id: string }> };

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

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { folder, id } = await params;
    const resend = getResend();

    const result = folder === "inbox"
      ? await resend.emails.receiving.get(id)
      : await resend.emails.get(id);

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 502 });
    }

    if (folder === "inbox" && result.data) {
      const received = result.data as typeof result.data & { headers?: Record<string, string> | null };
      const headers = received.headers;
      return NextResponse.json({
        email: {
          ...received,
          in_reply_to: headerValue(headers, "in-reply-to") || undefined,
          references: parseMessageIds(headerValue(headers, "references")),
        },
      });
    }

    return NextResponse.json({ email: result.data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load email" },
      { status: 500 },
    );
  }
}
