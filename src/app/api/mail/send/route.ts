import { NextRequest, NextResponse } from "next/server";
import { authorizeMailRequest } from "@/lib/mail-request-auth";
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

function extractInlineImages(html?: string) {
  const attachments: Array<{ filename: string; content: string; contentType: string; contentId: string }> = [];
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
        contentType,
        contentId,
      });
      return `src=${quote}cid:${contentId}${quote}`;
    },
  );

  return { html: nextHtml.trim() || undefined, attachments };
}

export async function POST(request: NextRequest) {
  const auth = await authorizeMailRequest(request);
  if (!auth.ok) return auth.response;
  try {
    const body = (await request.json()) as SendBody;
    const to = splitAddresses(body.to);
    if (!to.length) {
      return NextResponse.json({ error: "At least one recipient is required" }, { status: 400 });
    }

    const inline = extractInlineImages(body.html);
    const attachments = [
      ...(body.attachments ?? [])
        .filter((item) => item.name && item.content)
        .map((item) => ({
          filename: item.name,
          content: item.content,
          contentType: item.type || undefined,
        })),
      ...inline.attachments,
    ];

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
        html: inline.html,
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
