import { NextResponse } from "next/server";
import { getResend } from "@/lib/resend";

type Params = {
  params: Promise<{ folder: string; id: string; attachmentId: string }>;
};

export async function GET(_request: Request, { params }: Params) {
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

    return NextResponse.redirect(result.data.download_url);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossible de télécharger la pièce jointe" },
      { status: 500 },
    );
  }
}
