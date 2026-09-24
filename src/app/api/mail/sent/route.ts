import { NextRequest, NextResponse } from "next/server";
import { authorizeMailRequest } from "@/lib/mail-request-auth";
import { getResend } from "@/lib/resend";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await authorizeMailRequest(request);
  if (!auth.ok) return auth.response;
  try {
    const resend = getResend();
    const { data, error } = await resend.emails.list({ limit: 100 });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    return NextResponse.json({ emails: data?.data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load sent mail" },
      { status: 500 },
    );
  }
}
