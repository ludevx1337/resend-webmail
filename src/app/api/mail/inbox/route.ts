import { NextResponse } from "next/server";
import { getResend } from "@/lib/resend";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const resend = getResend();
    const { data, error } = await resend.emails.receiving.list({ limit: 100 });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    return NextResponse.json({ emails: data?.data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load inbox" },
      { status: 500 },
    );
  }
}
