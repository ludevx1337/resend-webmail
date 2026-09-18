import { NextRequest, NextResponse } from "next/server";
import { getDefaultFrom, getResend } from "@/lib/resend";

type SendBody = {
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
  attachments?: Array<{
    name?: string;
    content?: string;
    type?: string;
  }>;
};

function splitAddresses(value?: string) {
  return (value ?? "")
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SendBody;
    const to = splitAddresses(body.to);
    if (!to.length) {
      return NextResponse.json({ error: "At least one recipient is required" }, { status: 400 });
    }

    const attachments = (body.attachments ?? [])
      .filter((item) => item.name && item.content)
      .map((item) => ({
        filename: item.name,
        content: item.content,
        contentType: item.type || undefined,
      }));

    const resend = getResend();
    const references = [...new Set([
      ...(body.replyReferences ?? []),
      body.replyToMessageId,
    ].filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))];

    const headers = body.replyToMessageId
      ? {
          "In-Reply-To": body.replyToMessageId,
          References: references.join(" "),
        }
      : undefined;

    const { data, error } = await resend.emails.send(
      {
        from: body.from?.trim() || getDefaultFrom(),
        to,
        cc: splitAddresses(body.cc),
        bcc: splitAddresses(body.bcc),
        subject: body.subject?.trim() || "(Sans objet)",
        text: body.text?.trim() || " ",
        html: body.html?.trim() || undefined,
        headers,
        attachments,
      },
      body.idempotencyKey ? { idempotencyKey: body.idempotencyKey } : undefined,
    );

    if (error) {
      const statusCode = typeof (error as { statusCode?: unknown }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : 502;
      return NextResponse.json(
        { error: error.message, errorName: error.name },
        { status: statusCode },
      );
    }

    return NextResponse.json({ ok: true, email: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to send email" },
      { status: 500 },
    );
  }
}
