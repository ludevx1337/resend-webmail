import { NextRequest, NextResponse } from "next/server";
import { authorizeMailRequest } from "@/lib/mail-request-auth";
import { getDefaultFrom } from "@/lib/resend";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await authorizeMailRequest(request);
  if (!auth.ok) return auth.response;

  return NextResponse.json({
    defaultFrom: getDefaultFrom(),
    signatureHtml: String(process.env.MAILDESK_MOBILE_SIGNATURE_HTML || ""),
  });
}
