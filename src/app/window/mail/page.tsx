"use client";

import Image from "next/image";
import { Download, FileDown, FileText, Paperclip, Printer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SecureMailFrame } from "@/components/mail/secure-mail-frame";

type MailDetail = {
  id: string;
  direction?: "inbound" | "outbound";
  created_at?: string;
  from?: string;
  to?: string[];
  cc?: string[] | null;
  subject?: string;
  message_id?: string;
  in_reply_to?: string;
  references?: string[];
  html?: string | null;
  text?: string | null;
  attachments?: Array<{
    id?: string;
    filename?: string | null;
    size?: number;
    content_type?: string;
  }>;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatBytes(size?: number) {
  const value = Number(size || 0);
  if (!value) return "";
  if (value < 1024) return `${value} o`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} Ko`;
  return `${(value / (1024 * 1024)).toFixed(1)} Mo`;
}

function printableDocument(mail: MailDetail) {
  const body = mail.html || `<pre>${escapeHtml(mail.text || "Aucun contenu texte disponible.")}</pre>`;
  return `<!doctype html><html lang="fr"><head>
    <meta charset="utf-8">
    <meta name="referrer" content="no-referrer">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob: cid:; style-src 'unsafe-inline';">
    <title>${escapeHtml(mail.subject || "MailDesk")}</title>
    <style>
      @page{size:A4;margin:16mm}body{font:12px/1.55 Arial,sans-serif;color:#1f2937}
      h1{font-size:21px;border-bottom:2px solid #0f6cbd;padding-bottom:10px}
      dl{display:grid;grid-template-columns:45px 1fr;gap:3px 8px}dt{font-weight:700}dd{margin:0}
      .body{margin-top:20px}.body img{max-width:100%;height:auto}.body pre{white-space:pre-wrap;font:inherit}
    </style>
  </head><body>
    <h1>${escapeHtml(mail.subject || "(Sans objet)")}</h1>
    <dl>
      <dt>De</dt><dd>${escapeHtml(mail.from || "")}</dd>
      <dt>À</dt><dd>${escapeHtml((mail.to || []).join(", "))}</dd>
      ${mail.cc?.length ? `<dt>Cc</dt><dd>${escapeHtml(mail.cc.join(", "))}</dd>` : ""}
      <dt>Date</dt><dd>${escapeHtml(mail.created_at ? new Date(mail.created_at).toLocaleString("fr-FR") : "")}</dd>
    </dl>
    <div class="body">${body}</div>
  </body></html>`;
}

export default function DetachedMailPage() {
  const [mail, setMail] = useState<MailDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [remoteImages, setRemoteImages] = useState(false);

  const messageId = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("id") || "";
  }, []);

  useEffect(() => {
    if (!messageId || !window.maildesk) return;

    void (async () => {
      try {
        const settings = await window.maildesk!.getSettings();
        document.documentElement.style.setProperty("--brand", settings.themeColor || "#0f6cbd");
        let local = await window.maildesk!.getLocalMail(messageId) as MailDetail | null;
        if (!local) throw new Error("Message absent du cache local.");

        if (!local.html && !local.text) {
          const folder = local.direction === "outbound" ? "sent" : "inbox";
          const response = await fetch(`/api/mail/${folder}/${encodeURIComponent(messageId)}`, { cache: "no-store" });
          const json = await response.json();
          if (response.ok && json.email) {
            const remote = { ...local, ...json.email } as MailDetail;
            await window.maildesk!.cacheMailDetail({ mail: remote, direction: local.direction === "outbound" ? "outbound" : "inbound" });
            local = remote;
          }
        }

        setMail(local);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Impossible d’ouvrir ce message.");
      } finally {
        setLoading(false);
      }
    })();
  }, [messageId]);

  async function printMail() {
    if (!mail || !window.maildesk) return;
    await window.maildesk.printDocument({ title: mail.subject || "MailDesk", html: printableDocument(mail) });
  }

  async function exportPdf() {
    if (!mail || !window.maildesk) return;
    await window.maildesk.exportPdf({ title: mail.subject || "MailDesk", html: printableDocument(mail) });
  }

  async function exportEml() {
    if (!mail || !window.maildesk) return;
    await window.maildesk.exportEml({
      title: mail.subject || "message",
      folder: mail.direction === "outbound" ? "sent" : "inbox",
      message: mail,
    });
  }

  if (!messageId || (typeof window !== "undefined" && !window.maildesk)) return <main className="detached-mail-shell"><div className="detached-error">Message introuvable.</div></main>;
  if (loading) return <main className="detached-mail-shell"><div className="detached-loading">Chargement du message…</div></main>;
  if (!mail) return <main className="detached-mail-shell"><div className="detached-error">{error || "Message introuvable."}</div></main>;

  return (
    <main className="detached-mail-shell">
      <header className="detached-mail-topbar">
        <Image src="/logo_app_mail_resend_64.webp" width={34} height={34} alt="" priority />
        <div><strong>MailDesk</strong><span>Message détaché</span></div>
        <div className="detached-mail-actions">
          <button type="button" onClick={() => void printMail()}><Printer size={16} /> Imprimer</button>
          <button type="button" onClick={() => void exportPdf()}><FileDown size={16} /> PDF</button>
          <button type="button" onClick={() => void exportEml()}><FileText size={16} /> EML</button>
        </div>
      </header>

      <article className="detached-mail-content">
        <h1>{mail.subject || "(Sans objet)"}</h1>
        <div className="detached-meta">
          <strong>{mail.from || "Expéditeur inconnu"}</strong>
          <span>À : {(mail.to || []).join(", ")}</span>
          {mail.cc?.length ? <span>Cc : {mail.cc.join(", ")}</span> : null}
          <time>{mail.created_at ? new Date(mail.created_at).toLocaleString("fr-FR") : ""}</time>
        </div>

        {mail.attachments?.length ? (
          <div className="received-attachments">
            {mail.attachments.map((attachment) => attachment.id ? (
              <a key={attachment.id} href={`/api/mail/${mail.direction === "outbound" ? "sent" : "inbox"}/${mail.id}/attachments/${attachment.id}`} download>
                <Paperclip size={15} />
                <span><strong>{attachment.filename || "Pièce jointe"}</strong><small>{formatBytes(attachment.size)}</small></span>
                <Download size={15} />
              </a>
            ) : null)}
          </div>
        ) : null}

        <div className="detached-mail-body">
          {mail.html ? (
            <SecureMailFrame
              html={mail.html}
              title="Contenu du message"
              allowRemoteImages={remoteImages}
              onAllowRemoteImages={() => setRemoteImages(true)}
            />
          ) : <pre>{mail.text || "Aucun contenu texte disponible."}</pre>}
        </div>
      </article>
    </main>
  );
}
