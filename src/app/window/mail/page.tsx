"use client";

import {
  Archive,
  Download,
  FileDown,
  FileText,
  Flag,
  Forward,
  MailOpen,
  MoreHorizontal,
  Paperclip,
  Pin,
  Printer,
  Reply,
  ReplyAll,
  Send,
  ShieldBan,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { RecipientInput } from "@/components/mail/recipient-input";
import { RichTextEditor } from "@/components/mail/rich-text-editor";
import { SecureMailFrame } from "@/components/mail/secure-mail-frame";

type MailAttachment = {
  id?: string;
  filename?: string | null;
  size?: number;
  content_type?: string;
  url?: string;
};

type MailDetail = {
  id: string;
  direction?: "inbound" | "outbound";
  created_at?: string;
  from?: string;
  to?: string[];
  cc?: string[] | null;
  bcc?: string[] | null;
  reply_to?: string[] | null;
  subject?: string;
  message_id?: string;
  in_reply_to?: string;
  references?: string[];
  html?: string | null;
  text?: string | null;
  attachments?: MailAttachment[];
};

type ComposeAttachment = {
  name: string;
  size: number;
  content: string;
  type?: string;
};

type ComposeState = {
  from: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  text: string;
  html: string;
  replyToMessageId?: string;
  replyReferences?: string[];
  attachments: ComposeAttachment[];
};

type MailIdentity = {
  id: string;
  name: string;
  from: string;
  signature: string;
  isDefault: boolean;
};

type ComposeMode = "reply" | "replyAll" | "forward";

const EMPTY_COMPOSE: ComposeState = {
  from: "",
  to: "",
  cc: "",
  bcc: "",
  subject: "",
  text: "",
  html: "",
  attachments: [],
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function senderEmail(value?: string) {
  const raw = String(value || "").trim();
  const angle = raw.match(/<([^>]+)>/);
  return (angle?.[1] || raw).trim();
}

function normalizeAddress(value?: string) {
  return senderEmail(value).toLowerCase();
}

function normalizeSubject(prefix: "Re" | "TR", subject?: string) {
  const raw = subject || "";
  if (prefix === "Re" && /^re\s*:/i.test(raw)) return raw;
  if (prefix === "TR" && /^(tr|fw|fwd)\s*:/i.test(raw)) return raw;
  return `${prefix}: ${raw}`.trim();
}

function signatureToText(signature: string) {
  const trimmed = signature.trim();
  if (!trimmed) return "";
  if (!/<[a-z][\s\S]*>/i.test(trimmed)) return trimmed;
  return trimmed
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeSignatureHtml(html: string) {
  return String(html || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<(?:iframe|object|embed|form|input|button|textarea|select)\b[^>]*>[\s\S]*?<\/(?:iframe|object|embed|form|input|button|textarea|select)>/gi, "")
    .replace(/<(?:iframe|object|embed|form|input|button|textarea|select)\b[^>]*\/?\s*>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

function normalizeSignatureImageWidths(html: string) {
  return html.replace(/<img\b([^>]*)>/gi, (tag, attrs: string) => {
    if (/\swidth\s*=\s*["']?\d+/i.test(attrs)) return tag;
    const styleMatch = attrs.match(/\sstyle\s*=\s*(["'])(.*?)\1/i);
    const widthMatch = styleMatch?.[2]?.match(/(?:^|;)\s*width\s*:\s*(\d{1,4})px/i);
    if (!widthMatch) return tag;
    const width = Math.max(1, Math.min(1200, Number(widthMatch[1]) || 180));
    return `<img${attrs} width="${width}">`;
  });
}

function signatureToHtml(signature: string) {
  const trimmed = signature.trim();
  if (!trimmed) return "";
  if (/<[a-z][\s\S]*>/i.test(trimmed)) {
    return `<div class="maildesk-signature"><p><br></p>${normalizeSignatureImageWidths(sanitizeSignatureHtml(trimmed))}</div>`;
  }
  return `<div class="maildesk-signature"><p><br></p><p>${escapeHtml(trimmed).replace(/\n/g, "<br>")}</p></div>`;
}

function defaultIdentity(identities: MailIdentity[], fallbackFrom = "", fallbackSignature = "") {
  return identities.find((identity) => identity.isDefault)
    || identities[0]
    || (fallbackFrom
      ? { id: "default", name: "Principal", from: fallbackFrom, signature: fallbackSignature, isDefault: true }
      : null);
}

function identityForAddresses(identities: MailIdentity[], addresses: string[]) {
  const normalized = addresses.map(normalizeAddress).filter(Boolean);
  return identities.find((identity) => normalized.includes(normalizeAddress(identity.from)));
}

function replyReferences(mail: MailDetail) {
  const ordered = [...(mail.references ?? []), mail.in_reply_to, mail.message_id]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return [...new Set(ordered)];
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
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [remoteImages, setRemoteImages] = useState(false);
  const [identities, setIdentities] = useState<MailIdentity[]>([]);
  const [settingsFrom, setSettingsFrom] = useState("");
  const [signature, setSignature] = useState("");
  const [composeMode, setComposeMode] = useState<ComposeMode | null>(null);
  const [compose, setCompose] = useState<ComposeState>(EMPTY_COMPOSE);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [sending, setSending] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [starred, setStarred] = useState(false);
  const [flagged, setFlagged] = useState(false);
  const [pinned, setPinned] = useState(false);
  const draftIdRef = useRef("");

  const messageId = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("id") || "";
  }, []);

  useEffect(() => {
    if (!messageId || !window.maildesk) return;

    void (async () => {
      try {
        const settings = await window.maildesk!.getSettings();
        setIdentities(settings.identities || []);
        setSettingsFrom(settings.from || "");
        setSignature(settings.signature || "");
        document.documentElement.style.setProperty("--brand", settings.themeColor || "#0f6cbd");

        const snapshot = await window.maildesk!.getLocalSnapshot();
        setStarred(snapshot.starredIds.includes(messageId));
        setFlagged((snapshot.flaggedIds ?? []).includes(messageId));
        setPinned((snapshot.pinnedIds ?? []).includes(messageId));

        let local = await window.maildesk!.getLocalMail(messageId) as MailDetail | null;
        if (!local) throw new Error("Message absent du cache local.");

        if (!local.html && !local.text) {
          const folder = local.direction === "outbound" ? "sent" : "inbox";
          const response = await fetch(`/api/mail/${folder}/${encodeURIComponent(messageId)}`, { cache: "no-store" });
          const json = await response.json();
          if (response.ok && json.email) {
            const remote = { ...local, ...json.email } as MailDetail;
            await window.maildesk!.cacheMailDetail({
              mail: remote,
              direction: local.direction === "outbound" ? "outbound" : "inbound",
            });
            local = remote;
          }
        }

        setMail(local);
        if (local.direction !== "outbound") {
          await window.maildesk!.updateLocalMailState({ id: messageId, patch: { isRead: true } });
          void window.maildesk!.syncNow();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Impossible d’ouvrir ce message.");
      } finally {
        setLoading(false);
      }
    })();
  }, [messageId]);

  useEffect(() => {
    if (!composeMode || !draftIdRef.current || !window.maildesk) return;
    const timer = window.setTimeout(() => {
      void window.maildesk?.saveDraft({
        id: draftIdRef.current,
        ...compose,
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [compose, composeMode]);

  async function printMail() {
    if (!mail || !window.maildesk) return;
    await window.maildesk.printDocument({ title: mail.subject || "MailDesk", html: printableDocument(mail) });
  }

  async function exportPdf() {
    if (!mail || !window.maildesk) return;
    const result = await window.maildesk.exportPdf({ title: mail.subject || "MailDesk", html: printableDocument(mail) });
    if (result.ok && result.path) setStatus(`PDF exporté : ${result.path}`);
  }

  async function exportEml() {
    if (!mail || !window.maildesk) return;
    const result = await window.maildesk.exportEml({
      title: mail.subject || "message",
      folder: mail.direction === "outbound" ? "sent" : "inbox",
      message: mail,
    });
    if (result.ok && result.path) setStatus(`EML exporté : ${result.path}`);
  }

  async function persistState(patch: {
    folder?: string;
    isRead?: boolean;
    isStarred?: boolean;
    isFlagged?: boolean;
    isPinned?: boolean;
    isDeleted?: boolean;
  }) {
    if (!mail || !window.maildesk) return;
    await window.maildesk.updateLocalMailState({ id: mail.id, patch });
    void window.maildesk.syncNow();
  }

  async function toggleStar() {
    const next = !starred;
    setStarred(next);
    await persistState({ isStarred: next });
  }

  async function toggleFlag() {
    const next = !flagged;
    setFlagged(next);
    await persistState({ isFlagged: next });
  }

  async function togglePin() {
    const next = !pinned;
    setPinned(next);
    await persistState({ isPinned: next });
  }

  async function archiveMail() {
    await persistState({ folder: "archive", isDeleted: false });
    window.close();
  }

  async function trashMail() {
    await persistState({ folder: "trash", isPinned: false, isDeleted: false });
    window.close();
  }

  async function markUnread() {
    await persistState({ isRead: false });
    window.close();
  }

  async function blockSender() {
    if (!mail?.from || !window.maildesk) return;
    await window.maildesk.blockSender(mail.from);
    void window.maildesk.syncNow();
    window.close();
  }

  function openComposer(mode: ComposeMode) {
    if (!mail) return;

    const baseIdentity = defaultIdentity(identities, settingsFrom, signature);
    const fromSentFolder = mail.direction === "outbound";
    const replyIdentity = fromSentFolder
      ? (identityForAddresses(identities, [mail.from || ""]) || baseIdentity)
      : (identityForAddresses(identities, [...(mail.to ?? []), ...(mail.cc ?? [])]) || baseIdentity);
    const chosenIdentity = mode === "forward" ? baseIdentity : replyIdentity;
    const chosenSignature = chosenIdentity?.signature || signature;
    const originalText = mail.text?.trim() || "[Message HTML original]";
    const originalHtml = mail.html || `<pre>${escapeHtml(originalText)}</pre>`;

    let next: ComposeState;
    if (mode === "forward") {
      const forwardedText = [
        "",
        "",
        "---------- Message transféré ----------",
        `De : ${mail.from || ""}`,
        `Date : ${mail.created_at ? new Date(mail.created_at).toLocaleString("fr-FR") : ""}`,
        `Objet : ${mail.subject || ""}`,
        `À : ${(mail.to ?? []).join(", ")}`,
        "",
        originalText,
      ].join("\n");
      const forwardMeta = [
        `<strong>De :</strong> ${escapeHtml(mail.from || "")}`,
        `<strong>Date :</strong> ${escapeHtml(mail.created_at ? new Date(mail.created_at).toLocaleString("fr-FR") : "")}`,
        `<strong>Objet :</strong> ${escapeHtml(mail.subject || "")}`,
        `<strong>À :</strong> ${escapeHtml((mail.to ?? []).join(", "))}`,
      ].join("<br>");

      next = {
        ...EMPTY_COMPOSE,
        from: chosenIdentity?.from || settingsFrom,
        subject: normalizeSubject("TR", mail.subject),
        text: `${chosenSignature ? `\n\n${signatureToText(chosenSignature)}` : ""}${forwardedText}`,
        html: `${signatureToHtml(chosenSignature)}<br><hr><div>${forwardMeta}</div><br>${originalHtml}`,
      };
    } else {
      const ownAddresses = new Set(
        identities.map((identity) => normalizeAddress(identity.from)).filter(Boolean),
      );
      if (settingsFrom) ownAddresses.add(normalizeAddress(settingsFrom));

      const replyAddress = fromSentFolder
        ? (mail.to ?? []).join(", ")
        : (mail.reply_to?.[0] || senderEmail(mail.from));
      const replyAddressNormalized = normalizeAddress(replyAddress);
      const ccAddresses = mode === "replyAll"
        ? [...(mail.to ?? []), ...(mail.cc ?? [])]
          .filter((address) => {
            const normalized = normalizeAddress(address);
            return normalized && normalized !== replyAddressNormalized && !ownAddresses.has(normalized);
          })
        : [];
      const uniqueCc = [...new Map(ccAddresses.map((address) => [normalizeAddress(address), address])).values()];
      const replyLead = `\n\nLe ${mail.created_at ? new Date(mail.created_at).toLocaleString("fr-FR") : ""}, ${mail.from || ""} a écrit :\n${originalText}`;

      next = {
        ...EMPTY_COMPOSE,
        from: chosenIdentity?.from || settingsFrom,
        to: replyAddress,
        cc: uniqueCc.join(", "),
        subject: normalizeSubject("Re", mail.subject),
        text: `${chosenSignature ? `\n\n${signatureToText(chosenSignature)}` : ""}${replyLead}`,
        html: `${signatureToHtml(chosenSignature)}<br><div class="maildesk-quote-head">Le ${mail.created_at ? new Date(mail.created_at).toLocaleString("fr-FR") : ""}, ${escapeHtml(mail.from || "")} a écrit :</div><blockquote>${originalHtml}</blockquote>`,
        replyToMessageId: mail.message_id,
        replyReferences: replyReferences(mail),
        attachments: [],
      };
    }

    draftIdRef.current = globalThis.crypto.randomUUID();
    setCompose(next);
    setComposeMode(mode);
    setShowCc(Boolean(next.cc));
    setShowBcc(Boolean(next.bcc));
    setError("");
    setStatus("");
    setMoreOpen(false);
  }

  async function cancelCompose() {
    if (draftIdRef.current && window.maildesk) {
      await window.maildesk.deleteDraft(draftIdRef.current);
    }
    draftIdRef.current = "";
    setComposeMode(null);
    setCompose(EMPTY_COMPOSE);
  }

  async function addAttachments() {
    if (!window.maildesk) return;
    const files = await window.maildesk.pickAttachments();
    if (!files.length) return;
    setCompose((current) => ({ ...current, attachments: [...current.attachments, ...files] }));
  }

  async function sendMail(event: FormEvent) {
    event.preventDefault();
    if (!compose.to.trim()) {
      setError("Ajoutez au moins un destinataire.");
      return;
    }

    setSending(true);
    setError("");
    setStatus("");

    const payload = {
      ...compose,
      idempotencyKey: `maildesk/${globalThis.crypto.randomUUID()}`,
    };

    try {
      let response: Response | null = null;
      let json: { error?: string; email?: { id?: string } } = {};

      try {
        response = await fetch("/api/mail/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        json = await response.json().catch(() => ({}));
      } catch {
        response = null;
      }

      if (!response || response.status === 408 || response.status === 429 || response.status >= 500) {
        if (!window.maildesk) throw new Error("Connexion indisponible.");
        await window.maildesk.enqueueOutbox(payload);
        if (draftIdRef.current) await window.maildesk.deleteDraft(draftIdRef.current);
        draftIdRef.current = "";
        setComposeMode(null);
        setStatus("Connexion indisponible : message placé dans la boîte d’envoi.");
        return;
      }

      if (!response.ok) throw new Error(json.error || "Envoi impossible");

      if (window.maildesk && json.email?.id) {
        const splitAddresses = (value: string) => value.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
        await window.maildesk.cacheMailDetail({
          mail: {
            id: json.email.id,
            created_at: new Date().toISOString(),
            from: compose.from || undefined,
            to: splitAddresses(compose.to),
            cc: splitAddresses(compose.cc),
            bcc: splitAddresses(compose.bcc),
            subject: compose.subject || "(Sans objet)",
            html: compose.html || null,
            text: compose.text || null,
            in_reply_to: compose.replyToMessageId,
            references: compose.replyReferences ?? [],
          },
          direction: "outbound",
        });
        if (draftIdRef.current) await window.maildesk.deleteDraft(draftIdRef.current);
        void window.maildesk.syncNow();
      }

      draftIdRef.current = "";
      setComposeMode(null);
      setStatus("Message envoyé.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Envoi impossible.");
    } finally {
      setSending(false);
    }
  }

  if (!messageId || (typeof window !== "undefined" && !window.maildesk)) {
    return <main className="detached-mail-shell"><div className="detached-error">Message introuvable.</div></main>;
  }
  if (loading) return <main className="detached-mail-shell"><div className="detached-loading">Chargement du message…</div></main>;
  if (!mail) return <main className="detached-mail-shell"><div className="detached-error">{error || "Message introuvable."}</div></main>;

  return (
    <main className="detached-mail-shell">
      <header className="detached-mail-topbar">
        <div className="detached-mail-title">
          <strong>Message détaché</strong>
          <span>{mail.subject || "(Sans objet)"}</span>
        </div>
        <div className="detached-mail-actions">
          <button type="button" onClick={() => void printMail()} title="Imprimer" aria-label="Imprimer"><Printer size={17} /></button>
          <div className="detached-more-wrap">
            <button type="button" onClick={() => setMoreOpen((open) => !open)} title="Plus d’actions" aria-label="Plus d’actions"><MoreHorizontal size={19} /></button>
            {moreOpen && (
              <div className="detached-more-menu">
                <button type="button" onClick={() => { setMoreOpen(false); void exportPdf(); }}><FileDown size={16} /><span>Exporter en PDF</span></button>
                <button type="button" onClick={() => { setMoreOpen(false); void exportEml(); }}><FileText size={16} /><span>Exporter en EML</span></button>
                {mail.direction !== "outbound" && <button type="button" onClick={() => { setMoreOpen(false); void markUnread(); }}><MailOpen size={16} /><span>Marquer non lu</span></button>}
                {mail.direction !== "outbound" && <button type="button" onClick={() => { setMoreOpen(false); void blockSender(); }}><ShieldBan size={16} /><span>Bloquer l’expéditeur</span></button>}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="detached-commandbar">
        <div className="detached-command-group">
          <button type="button" onClick={() => openComposer("reply")} title="Répondre"><Reply size={18} /><span>Répondre</span></button>
          <button type="button" onClick={() => openComposer("replyAll")} title="Répondre à tous"><ReplyAll size={18} /><span>Répondre à tous</span></button>
          <button type="button" onClick={() => openComposer("forward")} title="Transférer"><Forward size={18} /><span>Transférer</span></button>
        </div>
        <div className="detached-command-group detached-command-state">
          <button type="button" className={starred ? "active" : ""} onClick={() => void toggleStar()} title="Favori"><Star size={18} fill={starred ? "currentColor" : "none"} /></button>
          <button type="button" className={flagged ? "active flag" : ""} onClick={() => void toggleFlag()} title="Drapeau"><Flag size={18} fill={flagged ? "currentColor" : "none"} /></button>
          <button type="button" className={pinned ? "active" : ""} onClick={() => void togglePin()} title="Épingler"><Pin size={18} fill={pinned ? "currentColor" : "none"} /></button>
          <button type="button" onClick={() => void archiveMail()} title="Archiver"><Archive size={18} /></button>
          <button type="button" onClick={() => void trashMail()} title="Supprimer"><Trash2 size={18} /></button>
        </div>
      </div>

      {(error || status) && <div className={error ? "detached-status error" : "detached-status"}>{error || status}</div>}

      {composeMode ? (
        <form className="detached-compose" onSubmit={sendMail}>
          <div className="detached-compose-head">
            <strong>{composeMode === "reply" ? "Répondre" : composeMode === "replyAll" ? "Répondre à tous" : "Transférer"}</strong>
            <button type="button" onClick={() => void cancelCompose()} title="Fermer la rédaction" aria-label="Fermer la rédaction"><X size={18} /></button>
          </div>

          <div className="compose-field">
            <span>De</span>
            {identities.length > 1 ? (
              <select
                value={compose.from}
                onChange={(event) => setCompose((current) => ({ ...current, from: event.target.value }))}
              >
                {identities.map((identity) => <option key={identity.id} value={identity.from}>{identity.name} — {identity.from}</option>)}
              </select>
            ) : (
              <input value={compose.from} onChange={(event) => setCompose((current) => ({ ...current, from: event.target.value }))} />
            )}
            <div />
          </div>
          <RecipientInput
            label="À"
            required
            value={compose.to}
            onChange={(value) => setCompose((current) => ({ ...current, to: value }))}
            trailing={(
              <span className="detached-recipient-tools">
                <button type="button" onClick={() => setShowCc((value) => !value)}>Cc</button>
                <button type="button" onClick={() => setShowBcc((value) => !value)}>Cci</button>
              </span>
            )}
          />
          {showCc && <RecipientInput label="Cc" value={compose.cc} onChange={(value) => setCompose((current) => ({ ...current, cc: value }))} />}
          {showBcc && <RecipientInput label="Cci" value={compose.bcc} onChange={(value) => setCompose((current) => ({ ...current, bcc: value }))} />}
          <div className="compose-field">
            <span>Objet</span>
            <input value={compose.subject} onChange={(event) => setCompose((current) => ({ ...current, subject: event.target.value }))} />
            <div />
          </div>

          <div className="detached-compose-editor">
            <RichTextEditor
              value={compose.html}
              onChange={(value) => setCompose((current) => ({ ...current, html: value.html, text: value.text }))}
            />
          </div>

          {compose.attachments.length > 0 && (
            <div className="compose-attachments">
              {compose.attachments.map((attachment, index) => (
                <span key={`${attachment.name}-${index}`}>
                  <Paperclip size={13} />
                  {attachment.name}
                  <small>{formatBytes(attachment.size)}</small>
                  <button type="button" onClick={() => setCompose((current) => ({ ...current, attachments: current.attachments.filter((_, itemIndex) => itemIndex !== index) }))}><X size={13} /></button>
                </span>
              ))}
            </div>
          )}

          <div className="compose-actions detached-compose-actions">
            <button className="send-button" type="submit" disabled={sending}><Send size={16} /> {sending ? "Envoi…" : "Envoyer"}</button>
            <button className="detached-secondary-action" type="button" onClick={() => void addAttachments()}><Paperclip size={16} /> Pièce jointe</button>
            <button className="detached-secondary-action" type="button" onClick={() => void cancelCompose()}>Annuler</button>
          </div>
        </form>
      ) : (
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
                <a key={attachment.id} href={attachment.url || `/api/mail/${mail.direction === "outbound" ? "sent" : "inbox"}/${mail.id}/attachments/${attachment.id}`} download>
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
      )}
    </main>
  );
}
