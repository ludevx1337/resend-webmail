import { NextRequest, NextResponse } from "next/server";
import { authorizeMailRequest } from "@/lib/mail-request-auth";
import { getResend } from "@/lib/resend";

type Params = {
  params: Promise<{ folder: string; id: string; attachmentId: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await authorizeMailRequest(request);
  if (!auth.ok) return auth.response;
  try {
    const { folder, id, attachmentId } = await params;
    const resend = getResend();
    const result = folder === "inbox"
      ? await resend.emails.receiving.attachments.get({ emailId: id, id: attachmentId })
      : await resend.emails.attachments.get({ emailId: id, id: attachmentId });

    if (result.error || !result.data?.download_url) {
      return NextResponse.json(
        { error: result.error?.message || "Pièce jointe introuvable" },
        { status: 404 },
      );
    }

    if ((request.headers.get("accept") || "").includes("application/json")) {
      return NextResponse.json(
        { url: result.data.download_url },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const redirect = NextResponse.redirect(result.data.download_url);
    redirect.headers.set("Cache-Control", "no-store");
    return redirect;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossible de télécharger la pièce jointe" },
      { status: 500 },
    );
  }
}
