"use client";

import {
  Archive,
  Bell,
  CalendarDays,
  CheckSquare2,
  ChevronDown,
  Clock3,
  ContactRound,
  Database,
  Download,
  Edit3,
  FileDown,
  ExternalLink,
  FileText,
  Flag,
  Folder as FolderIcon,
  FolderPlus,
  Forward,
  GripVertical,
  HelpCircle,
  Inbox,
  Mail,
  MailOpen,
  Menu,
  MoreHorizontal,
  Paperclip,
  Palette,
  Pin,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Reply,
  ReplyAll,
  RotateCcw,
  Save,
  Search,
  Send,
  Settings,
  ShieldBan,
  Star,
  Tag,
  Trash2,
  UserRound,
  Zap,
  X,
} from "lucide-react";
import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { RichTextEditor } from "@/components/mail/rich-text-editor";
import { SignatureEditor } from "@/components/mail/signature-editor";
import { RecipientInput } from "@/components/mail/recipient-input";
import { SecureMailFrame } from "@/components/mail/secure-mail-frame";

type SystemFolder = "inbox" | "drafts" | "sent" | "outbox" | "starred" | "archive" | "snoozed" | "junk" | "trash";
type Folder = SystemFolder | `custom:${string}`;
type ViewFilter = "all" | "unread" | "read" | "starred" | "flagged" | "pinned";
type SortDirection = "newest" | "oldest";
type GroupMode = "smart" | "day" | "week" | "month" | "none";
type ReadingTab = "mail" | "compose";
type ComposeKind = "new" | "reply" | "replyAll" | "forward" | "draft";

type ComposeTabEntry = {
  id: string;
  draftId: string;
  kind: ComposeKind;
  compose: ComposeState;
  showCc: boolean;
};

type MailItem = {
  id: string;
  created_at?: string;
  from?: string;
  to?: string[];
  subject?: string;
  message_id?: string;
  headers?: Record<string, string> | null;
  in_reply_to?: string;
  references?: string[];
  category?: string;
  snoozedUntil?: string;
  localFolder?: string;
  localFlagged?: boolean;
  localPinned?: boolean;
};

type InboundAttachment = {
  id: string;
  filename?: string | null;
  size?: number;
  content_type?: string;
  content_disposition?: string | null;
  url?: string;
};

type MailDetail = MailItem & {
  html?: string | null;
  text?: string | null;
  cc?: string[] | null;
  bcc?: string[] | null;
  reply_to?: string[] | null;
  attachments?: InboundAttachment[];
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

type DraftEntry = ComposeState & {
  id: string;
  updatedAt: string;
};

type OutboxEntry = ComposeState & {
  id: string;
  idempotencyKey?: string;
  status: "pending" | "sending" | "failed";
  attempts: number;
  lastError: string;
  nextAttemptAt?: string;
  sendAt?: string;
  createdAt: string;
  updatedAt: string;
};

type UndoSendState = {
  item: OutboxEntry;
  expiresAt: number;
};

type ContactEntry = {
  email: string;
  name: string;
  company: string;
  phone: string;
  notes: string;
  tags: string[];
  timesSeen: number;
  lastSeenAt?: string;
  isFavorite: boolean;
  source: "learned" | "manual";
  updatedAt: string;
};

type MailIdentity = {
  id: string;
  name: string;
  from: string;
  signature: string;
  isDefault: boolean;
};

type MailTemplateEntry = {
  id: string;
  name: string;
  subject: string;
  html: string;
  text: string;
  shortcut: string;
  createdAt: string;
  updatedAt: string;
};

type CalendarEventEntry = {
  id: string;
  title: string;
  description: string;
  location: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  attendees: string[];
  sourceUid: string;
  createdAt: string;
  updatedAt: string;
};

type SettingsTab = "account" | "sending" | "refresh" | "appearance" | "rules" | "templates" | "windows" | "data" | "supabase" | "updates";

type SettingsBaseline = {
  account: string;
  sending: string;
  refresh: string;
  appearance: string;
  rules: string;
  templates: string;
  windows: string;
  supabase: string;
  updates: string;
};

type CustomFolderEntry = {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type MailRuleConditionEntry = {
  id: string;
  field: "from" | "subject" | "to";
  operator: "contains" | "equals" | "ends_with";
  value: string;
};

type MailRuleActionEntry = {
  id: string;
  type: "archive" | "star" | "read" | "trash" | "move_to_folder" | "webhook";
  value?: string;
};

type MailRuleEntry = {
  id: string;
  name: string;
  field: MailRuleConditionEntry["field"];
  operator: MailRuleConditionEntry["operator"];
  value: string;
  action: MailRuleActionEntry["type"];
  actionValue?: string;
  conditions: MailRuleConditionEntry[];
  actions: MailRuleActionEntry[];
  matchMode: "all" | "any";
  priority: number;
  stopProcessing: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type MailRuleRunEntry = {
  id: string;
  ruleId: string;
  messageId: string;
  ruleName: string;
  actions: Array<{ type: MailRuleActionEntry["type"]; value?: string; queued?: boolean }>;
  status: string;
  detail: string;
  createdAt: string;
};

function ruleFieldLabel(field: MailRuleConditionEntry["field"]) {
  return field === "from" ? "Expéditeur" : field === "subject" ? "Objet" : "Destinataire";
}

function ruleOperatorLabel(operator: MailRuleConditionEntry["operator"]) {
  return operator === "contains" ? "contient" : operator === "equals" ? "est exactement" : "se termine par";
}

function ruleActionLabel(action: MailRuleActionEntry, folders: CustomFolderEntry[]) {
  if (action.type === "archive") return "Archiver";
  if (action.type === "star") return "Ajouter aux favoris";
  if (action.type === "read") return "Marquer comme lu";
  if (action.type === "trash") return "Corbeille";
  if (action.type === "move_to_folder") {
    return `Dossier « ${folders.find((folder) => folder.id === action.value)?.name || "introuvable"} »`;
  }
  return `Webhook → ${action.value || "URL manquante"}`;
}

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

const REFRESH_INTERVALS = [5, 10, 30, 60, 300, 600, 1800, 3600] as const;
const THEME_PRESETS = [
  { name: "Bleu", color: "#0f6cbd" },
  { name: "Violet", color: "#7c3aed" },
  { name: "Émeraude", color: "#059669" },
  { name: "Orange", color: "#ea580c" },
  { name: "Rose", color: "#db2777" },
  { name: "Ardoise", color: "#475569" },
] as const;

function normalizeThemeColor(value: string) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#0f6cbd";
}

function refreshIntervalLabel(seconds: number) {
  if (seconds < 60) return `${seconds} s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return "1 h";
}

function refreshIntervalIndex(seconds: number) {
  const exact = REFRESH_INTERVALS.indexOf(seconds as (typeof REFRESH_INTERVALS)[number]);
  if (exact >= 0) return exact;
  let closest = 0;
  let distance = Number.POSITIVE_INFINITY;
  REFRESH_INTERVALS.forEach((value, index) => {
    const nextDistance = Math.abs(value - seconds);
    if (nextDistance < distance) {
      distance = nextDistance;
      closest = index;
    }
  });
  return closest;
}

const MAIL_CATEGORIES = [
  { id: "red", label: "Rouge" },
  { id: "orange", label: "Orange" },
  { id: "yellow", label: "Jaune" },
  { id: "green", label: "Vert" },
  { id: "blue", label: "Bleu" },
  { id: "purple", label: "Violet" },
] as const;

const STORAGE = {
  read: "maildesk-read",
  starred: "maildesk-starred",
  archived: "maildesk-archived",
  trashed: "maildesk-trashed",
  deleted: "maildesk-deleted",
  draft: "maildesk-draft",
} as const;

function senderName(value?: string) {
  if (!value) return "Expéditeur inconnu";
  const match = value.match(/^\s*"?([^"<]+)"?\s*</);
  return match?.[1]?.trim() || value.split("@")[0];
}

function senderEmail(value?: string) {
  if (!value) return "";
  const match = value.match(/<([^>]+)>/);
  return match?.[1] || value;
}

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat(
    "fr-FR",
    sameDay ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "short" },
  ).format(date);
}

function formatDateTimeLocal(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatBytes(value?: number) {
  if (!value) return "0 o";
  if (value < 1024) return `${value} o`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} Ko`;
  return `${(value / (1024 * 1024)).toFixed(1)} Mo`;
}

function loadIds(key: string) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function addId(ids: string[], id: string) {
  return ids.includes(id) ? ids : [...ids, id];
}

function removeId(ids: string[], id: string) {
  return ids.filter((item) => item !== id);
}

function hasComposeContent(compose: ComposeState, signature = "") {
  const bodyText = compose.text.trim();
  const signatureText = signatureToText(signature).trim();
  const hasBody = Boolean(bodyText && bodyText !== signatureText);

  return Boolean(
    compose.to.trim()
    || compose.cc.trim()
    || compose.bcc.trim()
    || compose.subject.trim()
    || hasBody
    || compose.replyToMessageId
    || compose.attachments.length,
  );
}

function mergeMailLists(primary: MailItem[], cached: MailItem[]) {
  const byId = new Map<string, MailItem>();
  cached.forEach((mail) => byId.set(mail.id, mail));
  primary.forEach((mail) => byId.set(mail.id, { ...byId.get(mail.id), ...mail }));
  return [...byId.values()];
}

function normalizeMessageId(value?: string) {
  return String(value || "").trim().toLowerCase();
}

function buildConversationIndex(items: MailItem[]) {
  const byMessageId = new Map<string, MailItem>();
  items.forEach((mail) => {
    const messageId = normalizeMessageId(mail.message_id);
    if (messageId) byMessageId.set(messageId, mail);
  });

  const keyById = new Map<string, string>();
  const resolving = new Set<string>();

  const resolveKey = (mail: MailItem): string => {
    const cached = keyById.get(mail.id);
    if (cached) return cached;
    if (resolving.has(mail.id)) return `id:${mail.id}`;

    resolving.add(mail.id);
    const references = (mail.references ?? []).map(normalizeMessageId).filter(Boolean);
    const parentId = normalizeMessageId(mail.in_reply_to);
    const ownMessageId = normalizeMessageId(mail.message_id);

    let key: string;
    if (references.length > 0) {
      key = `mid:${references[0]}`;
    } else if (parentId) {
      const parent = byMessageId.get(parentId);
      key = parent ? resolveKey(parent) : `mid:${parentId}`;
    } else if (ownMessageId) {
      key = `mid:${ownMessageId}`;
    } else {
      key = `id:${mail.id}`;
    }

    resolving.delete(mail.id);
    keyById.set(mail.id, key);
    return key;
  };

  const messagesByKey = new Map<string, MailItem[]>();
  items.forEach((mail) => {
    const key = resolveKey(mail);
    const group = messagesByKey.get(key) ?? [];
    group.push(mail);
    messagesByKey.set(key, group);
  });

  messagesByKey.forEach((group) => {
    group.sort((left, right) => new Date(left.created_at || 0).getTime() - new Date(right.created_at || 0).getTime());
  });

  return { keyById, messagesByKey };
}

function replyReferencesFor(mail: MailItem) {
  const ordered = [...(mail.references ?? []), mail.in_reply_to, mail.message_id]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return [...new Set(ordered)];
}

function normalizeSubject(prefix: "Re" | "TR", subject?: string) {
  const raw = subject || "";
  if (prefix === "Re" && /^re\s*:/i.test(raw)) return raw;
  if (prefix === "TR" && /^(tr|fw|fwd)\s*:/i.test(raw)) return raw;
  return `${prefix}: ${raw}`.trim();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizePrintableHtml(html: string) {
  return String(html || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<(?:iframe|object|embed|form|input|button|textarea|select)\b[^>]*>[\s\S]*?<\/(?:iframe|object|embed|form|input|button|textarea|select)>/gi, "")
    .replace(/<(?:iframe|object|embed|form|input|button|textarea|select)\b[^>]*\/?\s*>/gi, "")
    .replace(/<base\b[^>]*>/gi, "")
    .replace(/<meta\b[^>]*>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

function buildPrintableConversationDocument(messages: MailDetail[]) {
  const title = messages[messages.length - 1]?.subject || "Conversation MailDesk";
  const sections = messages.map((message, index) => {
    const body = message.html
      ? sanitizePrintableHtml(message.html)
      : `<pre>${escapeHtml(message.text || "Aucun contenu texte disponible.")}</pre>`;
    const attachments = message.attachments?.length
      ? `<div class="attachments"><strong>Pièces jointes :</strong> ${message.attachments.map((attachment) => escapeHtml(attachment.filename || "Pièce jointe")).join(", ")}</div>`
      : "";
    return `
      <section class="mail ${index > 0 ? "continued" : ""}">
        <header>
          <h2>${escapeHtml(message.subject || "(Sans objet)")}</h2>
          <dl>
            <dt>De</dt><dd>${escapeHtml(message.from || "")}</dd>
            <dt>À</dt><dd>${escapeHtml((message.to ?? []).join(", "))}</dd>
            ${message.cc?.length ? `<dt>Cc</dt><dd>${escapeHtml(message.cc.join(", "))}</dd>` : ""}
            <dt>Date</dt><dd>${escapeHtml(message.created_at ? new Date(message.created_at).toLocaleString("fr-FR") : "")}</dd>
          </dl>
          ${attachments}
        </header>
        <div class="body">${body}</div>
      </section>
    `;
  }).join("");

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob: cid:; style-src 'unsafe-inline'; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none';">
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #1f2937; font: 12px/1.55 Arial, Helvetica, sans-serif; background: #fff; }
    .document-title { margin: 0 0 18px; padding-bottom: 10px; border-bottom: 2px solid #0f6cbd; font-size: 22px; color: #172b3e; }
    .mail { margin: 0 0 24px; break-inside: auto; }
    .mail.continued { padding-top: 16px; border-top: 1px solid #dfe5eb; }
    h2 { margin: 0 0 10px; font-size: 17px; line-height: 1.3; }
    dl { display: grid; grid-template-columns: 45px 1fr; gap: 2px 8px; margin: 0 0 10px; color: #4b5f73; }
    dt { font-weight: 700; }
    dd { margin: 0; overflow-wrap: anywhere; }
    .attachments { margin: 8px 0 12px; padding: 7px 9px; border-radius: 5px; background: #f4f7fa; color: #4b5f73; }
    .body { margin-top: 14px; overflow-wrap: anywhere; }
    .body img { max-width: 100%; height: auto; }
    .body pre { white-space: pre-wrap; font: inherit; }
    .body table { max-width: 100%; }
    a { color: #0f6cbd; text-decoration: underline; }
  </style>
</head>
<body>
  <h1 class="document-title">${escapeHtml(title)}</h1>
  ${sections}
</body>
</html>`;
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
    const safe = normalizeSignatureImageWidths(sanitizePrintableHtml(trimmed));
    return `<div class="maildesk-signature"><p><br></p>${safe}</div>`;
  }
  return `<div class="maildesk-signature"><p><br></p><p>${escapeHtml(trimmed).replace(/\n/g, "<br>")}</p></div>`;
}

function defaultIdentityOf(identities: MailIdentity[], fallbackFrom = "", fallbackSignature = "") {
  return identities.find((identity) => identity.isDefault)
    || identities[0]
    || (fallbackFrom
      ? { id: "default", name: "Principal", from: fallbackFrom, signature: fallbackSignature, isDefault: true }
      : null);
}

function signatureForSender(identities: MailIdentity[], from: string, fallbackSignature = "") {
  return identities.find((identity) => identity.from === from)?.signature ?? fallbackSignature;
}

function findIdentityForAddresses(identities: MailIdentity[], addresses: string[]) {
  const normalized = addresses.map((value) => senderEmail(value).trim().toLowerCase()).filter(Boolean);
  return identities.find((identity) => normalized.includes(senderEmail(identity.from).trim().toLowerCase()));
}

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function startOfLocalWeek(value: Date) {
  const day = startOfLocalDay(value);
  const weekday = day.getDay() || 7;
  day.setDate(day.getDate() - weekday + 1);
  return day;
}

function mailGroupLabel(createdAt: string | undefined, mode: GroupMode, pinned = false) {
  if (pinned) return "Épinglés";
  const date = createdAt ? new Date(createdAt) : new Date(0);
  if (Number.isNaN(date.getTime())) return "Plus ancien";

  const now = new Date();
  const today = startOfLocalDay(now);
  const messageDay = startOfLocalDay(date);
  const daysAgo = Math.round((today.getTime() - messageDay.getTime()) / 86_400_000);

  if (mode === "day") {
    if (daysAgo === 0) return "Aujourd’hui";
    if (daysAgo === 1) return "Hier";
    return date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
  }

  if (mode === "week") {
    const weekStart = startOfLocalWeek(date);
    const currentWeek = startOfLocalWeek(now);
    const weekDiff = Math.round((currentWeek.getTime() - weekStart.getTime()) / (7 * 86_400_000));
    if (weekDiff === 0) return "Cette semaine";
    if (weekDiff === 1) return "La semaine dernière";
    return `Semaine du ${weekStart.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: weekStart.getFullYear() !== now.getFullYear() ? "numeric" : undefined })}`;
  }

  if (mode === "month") {
    const sameMonth = date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    if (sameMonth) return "Ce mois-ci";
    return date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  }

  if (mode === "smart") {
    if (daysAgo === 0) return "Aujourd’hui";
    if (daysAgo === 1) return "Hier";
    const weekStart = startOfLocalWeek(now);
    if (messageDay >= weekStart) return "Cette semaine";
    const previousWeekStart = new Date(weekStart);
    previousWeekStart.setDate(previousWeekStart.getDate() - 7);
    if (messageDay >= previousWeekStart) return "La semaine dernière";
    if (date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()) return "Ce mois-ci";
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    if (date.getMonth() === previousMonth.getMonth() && date.getFullYear() === previousMonth.getFullYear()) return "Le mois dernier";
    return "Plus ancien";
  }

  return "";
}

export default function Home() {
  const [folder, setFolder] = useState<Folder>("inbox");
  const [inbox, setInbox] = useState<MailItem[]>([]);
  const [sent, setSent] = useState<MailItem[]>([]);
  const [outbox, setOutbox] = useState<OutboxEntry[]>([]);
  const [drafts, setDrafts] = useState<DraftEntry[]>([]);
  const [currentDraftId, setCurrentDraftId] = useState("");
  const [selected, setSelected] = useState<MailItem | null>(null);
  const [detail, setDetail] = useState<MailDetail | null>(null);
  const [threadDetails, setThreadDetails] = useState<Record<string, MailDetail>>({});
  const [expandedThreadIds, setExpandedThreadIds] = useState<string[]>([]);
  const [remoteImagesAllowedIds, setRemoteImagesAllowedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [localSearchIds, setLocalSearchIds] = useState<string[] | null>(null);
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sortDirection, setSortDirection] = useState<SortDirection>("newest");
  const [groupMode, setGroupMode] = useState<GroupMode>("smart");
  const [collapsedMailGroups, setCollapsedMailGroups] = useState<string[]>([]);
  const [multiSelectEnabled, setMultiSelectEnabled] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [readIds, setReadIds] = useState<string[]>([]);
  const [starredIds, setStarredIds] = useState<string[]>([]);
  const [flaggedIds, setFlaggedIds] = useState<string[]>([]);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [archivedIds, setArchivedIds] = useState<string[]>([]);
  const [trashedIds, setTrashedIds] = useState<string[]>([]);
  const [junkIds, setJunkIds] = useState<string[]>([]);
  const [snoozedIds, setSnoozedIds] = useState<string[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [activeReadingTab, setActiveReadingTab] = useState<ReadingTab>("mail");
  const [composeTabs, setComposeTabs] = useState<ComposeTabEntry[]>([]);
  const [activeComposeTabId, setActiveComposeTabId] = useState("");
  const [composeKind, setComposeKind] = useState<ComposeKind>("new");
  const [compose, setCompose] = useState<ComposeState>(EMPTY_COMPOSE);
  const [sending, setSending] = useState(false);
  const [showCc, setShowCc] = useState(false);
  const [undoSendSeconds, setUndoSendSeconds] = useState(10);
  const [settingsUndoSendSeconds, setSettingsUndoSendSeconds] = useState(10);
  const [refreshIntervalSeconds, setRefreshIntervalSeconds] = useState(60);
  const [settingsRefreshIntervalSeconds, setSettingsRefreshIntervalSeconds] = useState(60);
  const [themeColor, setThemeColor] = useState("#0f6cbd");
  const [settingsThemeColor, setSettingsThemeColor] = useState("#0f6cbd");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [undoSend, setUndoSend] = useState<UndoSendState | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [contacts, setContacts] = useState<ContactEntry[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactCompany, setContactCompany] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactNotes, setContactNotes] = useState("");
  const [contactTags, setContactTags] = useState("");
  const [editingContactEmail, setEditingContactEmail] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventEntry[]>([]);
  const [calendarTitle, setCalendarTitle] = useState("");
  const [calendarDescription, setCalendarDescription] = useState("");
  const [calendarLocation, setCalendarLocation] = useState("");
  const [calendarStart, setCalendarStart] = useState("");
  const [calendarEnd, setCalendarEnd] = useState("");
  const [calendarAttendees, setCalendarAttendees] = useState("");
  const [calendarAllDay, setCalendarAllDay] = useState(false);
  const [editingCalendarId, setEditingCalendarId] = useState("");
  const [templates, setTemplates] = useState<MailTemplateEntry[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateSubject, setTemplateSubject] = useState("");
  const [templateHtml, setTemplateHtml] = useState("");
  const [templateText, setTemplateText] = useState("");
  const [templateShortcut, setTemplateShortcut] = useState("");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("account");
  const [settingsBaselines, setSettingsBaselines] = useState<SettingsBaseline>({
    account: "",
    sending: "",
    refresh: "",
    appearance: "",
    rules: "",
    templates: "",
    windows: "",
    supabase: "",
    updates: "",
  });
  const [rules, setRules] = useState<MailRuleEntry[]>([]);
  const [customFolders, setCustomFolders] = useState<CustomFolderEntry[]>([]);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [draggedFolderId, setDraggedFolderId] = useState("");
  const [searchHelpOpen, setSearchHelpOpen] = useState(false);
  const [messageMoreOpen, setMessageMoreOpen] = useState(false);
  const [blockedSenders, setBlockedSenders] = useState<Array<{ email: string; createdAt: string }>>([]);
  const [ruleName, setRuleName] = useState("");
  const [ruleConditions, setRuleConditions] = useState<MailRuleConditionEntry[]>([
    { id: "condition-1", field: "from", operator: "contains", value: "" },
  ]);
  const [ruleActions, setRuleActions] = useState<MailRuleActionEntry[]>([
    { id: "action-1", type: "archive", value: "" },
  ]);
  const [ruleMatchMode, setRuleMatchMode] = useState<"all" | "any">("all");
  const [rulePriority, setRulePriority] = useState(100);
  const [ruleStopProcessing, setRuleStopProcessing] = useState(false);
  const [ruleTestResult, setRuleTestResult] = useState<{ matched: number; samples: Array<{ id: string; from: string; subject: string; createdAt: string }> } | null>(null);
  const [ruleRuns, setRuleRuns] = useState<MailRuleRunEntry[]>([]);
  const [ruleFolderCreateActionId, setRuleFolderCreateActionId] = useState("");
  const [ruleFolderCreateName, setRuleFolderCreateName] = useState("");
  const [identities, setIdentities] = useState<MailIdentity[]>([]);
  const [settingsIdentities, setSettingsIdentities] = useState<MailIdentity[]>([]);
  const [signature, setSignature] = useState("");
  const [settingsFrom, setSettingsFrom] = useState("");
  const [settingsApiKey, setSettingsApiKey] = useState("");
  const [settingsHasApiKey, setSettingsHasApiKey] = useState(false);
  const [settingsSignature, setSettingsSignature] = useState("");
  const [settingsSupabaseUrl, setSettingsSupabaseUrl] = useState("");
  const [settingsSupabaseKey, setSettingsSupabaseKey] = useState("");
  const [settingsSupabaseProjectRef, setSettingsSupabaseProjectRef] = useState("");
  const [settingsSupabaseManagementToken, setSettingsSupabaseManagementToken] = useState("");
  const [settingsHasSupabaseKey, setSettingsHasSupabaseKey] = useState(false);
  const [settingsHasSupabaseManagementToken, setSettingsHasSupabaseManagementToken] = useState(false);
  const [mobileProvisioningQr, setMobileProvisioningQr] = useState("");
  const [mobileProvisioningProjectRef, setMobileProvisioningProjectRef] = useState("");
  const [mobileProvisioningConfigured, setMobileProvisioningConfigured] = useState(false);
  const [mobileProvisioningReason, setMobileProvisioningReason] = useState("Configuration mobile incomplète.");
  const [mobileQrDialogOpen, setMobileQrDialogOpen] = useState(false);
  const [mobileQrDialogError, setMobileQrDialogError] = useState("");
  const [generatingMobileQr, setGeneratingMobileQr] = useState(false);
  const [settingsAutoUpdateEnabled, setSettingsAutoUpdateEnabled] = useState(false);
  const [settingsUpdateManifestUrl, setSettingsUpdateManifestUrl] = useState("");
  const [updateStatusMessage, setUpdateStatusMessage] = useState("");
  const [updateReady, setUpdateReady] = useState(false);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [settingsStartWithWindows, setSettingsStartWithWindows] = useState(false);
  const [settingsMailtoRegistered, setSettingsMailtoRegistered] = useState(false);
  const [settingsIsPackaged, setSettingsIsPackaged] = useState(false);
  const [settingsAppVersion, setSettingsAppVersion] = useState("");
  const [settingsUserDataPath, setSettingsUserDataPath] = useState("");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [databasePath, setDatabasePath] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [initializingSupabase, setInitializingSupabase] = useState(false);
  const [deployingMobileEdge, setDeployingMobileEdge] = useState(false);
  const [edgeDeployMessage, setEdgeDeployMessage] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const knownInboxIdsRef = useRef<Set<string> | null>(null);
  const refreshRunningRef = useRef(false);

  const allMail = useMemo(() => {
    const byId = new Map<string, MailItem>();
    [...inbox, ...sent].forEach((mail) => byId.set(mail.id, mail));
    return [...byId.values()];
  }, [inbox, sent]);

  const supabaseEdgeApiUrl = settingsSupabaseUrl.trim()
    ? `${settingsSupabaseUrl.trim().replace(/\/$/, "")}/functions/v1/maildesk-api`
    : "";

  const settingsSnapshots: SettingsBaseline = {
    account: JSON.stringify({
      from: settingsFrom.trim(),
      signature: settingsSignature,
      identities: materializedSettingsIdentities(),
      apiKeyChanged: Boolean(settingsApiKey.trim()),
    }),
    sending: JSON.stringify({ undoSendSeconds: settingsUndoSendSeconds }),
    refresh: JSON.stringify({ refreshIntervalSeconds: settingsRefreshIntervalSeconds }),
    appearance: JSON.stringify({ themeColor: normalizeThemeColor(settingsThemeColor) }),
    rules: JSON.stringify({
      name: ruleName,
      conditions: ruleConditions.map(({ field, operator, value }) => ({ field, operator, value })),
      actions: ruleActions.map(({ type, value }) => ({ type, value: value || "" })),
      matchMode: ruleMatchMode,
      priority: rulePriority,
      stopProcessing: ruleStopProcessing,
    }),
    templates: JSON.stringify({
      id: templateId,
      name: templateName,
      subject: templateSubject,
      html: templateHtml,
      text: templateText,
      shortcut: templateShortcut,
    }),
    windows: JSON.stringify({
      startWithWindows: settingsStartWithWindows,
      mailtoRegistered: settingsMailtoRegistered,
    }),
    supabase: JSON.stringify({
      url: settingsSupabaseUrl.trim(),
      projectRef: settingsSupabaseProjectRef.trim(),
      keyChanged: Boolean(settingsSupabaseKey.trim()),
      managementTokenChanged: Boolean(settingsSupabaseManagementToken.trim()),
    }),
    updates: JSON.stringify({
      enabled: settingsAutoUpdateEnabled,
      manifestUrl: settingsUpdateManifestUrl.trim(),
    }),
  };

  const settingsBaselineKey = settingsTab === "data" ? null : settingsTab;
  const activeSettingsDirty = settingsBaselineKey
    ? settingsSnapshots[settingsBaselineKey] !== settingsBaselines[settingsBaselineKey]
    : false;

  function settingsTabIsDirty(tab: SettingsTab) {
    if (tab === "data") return false;
    return settingsSnapshots[tab] !== settingsBaselines[tab];
  }

  function settingsPanelSaveButton(tab: SettingsTab) {
    const dirty = settingsTabIsDirty(tab);
    const busy = savingSettings || initializingSupabase;
    return (
      <button
        type="button"
        className={dirty ? "settings-save-icon dirty" : "settings-save-icon"}
        disabled={!dirty || busy}
        onClick={() => void saveActiveSettingsTab()}
        title={dirty ? "Enregistrer les modifications de cet onglet" : "Aucune modification"}
      >
        <Save size={17} />
        <span>{savingSettings && settingsTab === tab ? "Enregistrement..." : dirty ? "Enregistrer" : "Enregistré"}</span>
      </button>
    );
  }

  const conversationIndex = useMemo(
    () => buildConversationIndex(allMail.filter((mail) => !deletedIds.includes(mail.id))),
    [allMail, deletedIds],
  );

  const selectedConversation = useMemo(() => {
    if (!selected) return [];
    const key = conversationIndex.keyById.get(selected.id);
    if (!key) return [selected];
    return conversationIndex.messagesByKey.get(key) ?? [selected];
  }, [conversationIndex, selected]);

  const filteredContacts = useMemo(() => {
    const term = contactSearch.trim().toLowerCase();
    if (!term) return contacts;
    return contacts.filter((contact) => `${contact.name} ${contact.email} ${contact.company} ${contact.phone} ${contact.tags.join(" ")}`.toLowerCase().includes(term));
  }, [contactSearch, contacts]);

  useEffect(() => {
    const activeColor = normalizeThemeColor(settingsOpen ? settingsThemeColor : themeColor);
    document.documentElement.style.setProperty("--brand", activeColor);
  }, [settingsOpen, settingsThemeColor, themeColor]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void (async () => {
        if (window.maildesk) {
          try {
            const [snapshot, currentSettings, queued, storedDrafts, storedFolders, storedTemplates, mobileStatus] = await Promise.all([
              window.maildesk.getLocalSnapshot(),
              window.maildesk.getSettings(),
              window.maildesk.getOutbox(),
              window.maildesk.listDrafts(),
              window.maildesk.listCustomFolders(),
              window.maildesk.listTemplates(),
              window.maildesk.getMobileProvisioningStatus(),
            ]);
            const storedDraft = storedDrafts[0] || null;
            setInbox(snapshot.messages.filter((mail) => mail.direction !== "outbound") as MailItem[]);
            setSent(snapshot.messages.filter((mail) => mail.direction === "outbound") as MailItem[]);
            setOutbox(queued as OutboxEntry[]);
            setDrafts(storedDrafts as DraftEntry[]);
            setCustomFolders(storedFolders as CustomFolderEntry[]);
            setTemplates(storedTemplates as MailTemplateEntry[]);
            setReadIds(snapshot.readIds);
            setStarredIds(snapshot.starredIds);
            setFlaggedIds(snapshot.flaggedIds ?? []);
            setPinnedIds(snapshot.pinnedIds ?? []);
            setArchivedIds(snapshot.archivedIds);
            setTrashedIds(snapshot.trashedIds);
            setJunkIds(snapshot.junkIds ?? []);
            setSnoozedIds(snapshot.snoozedIds ?? []);
            setDeletedIds(snapshot.deletedIds);
            const loadedIdentities = currentSettings.identities ?? [];
            const defaultIdentity = defaultIdentityOf(loadedIdentities, currentSettings.from, currentSettings.signature || "");
            setIdentities(loadedIdentities);
            setSignature(defaultIdentity?.signature || currentSettings.signature || "");
            setUndoSendSeconds(Number(currentSettings.undoSendSeconds ?? 10));
            setRefreshIntervalSeconds(Math.max(5, Math.min(3600, Number(currentSettings.refreshIntervalSeconds ?? 60))));
            setThemeColor(normalizeThemeColor(currentSettings.themeColor || "#0f6cbd"));
            setSettingsThemeColor(normalizeThemeColor(currentSettings.themeColor || "#0f6cbd"));
            setDatabasePath(currentSettings.databasePath || "");
            setMobileProvisioningConfigured(Boolean(mobileStatus.configured));
            setMobileProvisioningReason(mobileStatus.reason || "QR mobile prêt.");
            if (storedDraft) {
              setCurrentDraftId(storedDraft.id);
              setCompose({
                ...EMPTY_COMPOSE,
                from: storedDraft.from || defaultIdentity?.from || currentSettings.from || "",
                to: storedDraft.to,
                cc: storedDraft.cc,
                bcc: storedDraft.bcc,
                subject: storedDraft.subject,
                text: storedDraft.text,
                html: storedDraft.html,
                replyToMessageId: storedDraft.replyToMessageId,
                replyReferences: storedDraft.replyReferences ?? [],
                attachments: storedDraft.attachments ?? [],
              });
            } else {
              try {
                const legacyRaw = localStorage.getItem(STORAGE.draft);
                if (legacyRaw) {
                  const legacy = JSON.parse(legacyRaw) as Partial<ComposeState>;
                  const migrated = {
                    ...EMPTY_COMPOSE,
                    ...legacy,
                    from: legacy.from || defaultIdentity?.from || currentSettings.from || "",
                    attachments: [],
                  };
                  const migratedId = globalThis.crypto.randomUUID();
                  const savedDraft = await window.maildesk.saveDraft({ ...migrated, id: migratedId });
                  setCurrentDraftId(migratedId);
                  setCompose(migrated);
                  setDrafts([savedDraft as DraftEntry, ...storedDrafts as DraftEntry[]]);
                  localStorage.removeItem(STORAGE.draft);
                }
              } catch {
                // Ignore an invalid legacy draft; SQLite remains the source of truth.
              }
            }
          } catch {
            // If the local database is unavailable, the Resend refresh below still keeps the client usable.
          }
        } else {
          setReadIds(loadIds(STORAGE.read));
          setStarredIds(loadIds(STORAGE.starred));
          setArchivedIds(loadIds(STORAGE.archived));
          setTrashedIds(loadIds(STORAGE.trashed));
          setDeletedIds(loadIds(STORAGE.deleted));
          try {
            const raw = localStorage.getItem(STORAGE.draft);
            if (raw) {
              const saved = JSON.parse(raw) as Partial<ComposeState>;
              setCompose({ ...EMPTY_COMPOSE, ...saved, attachments: [] });
            }
          } catch {
            // Ignore a corrupted browser draft and keep the composer usable.
          }
        }
        await refresh();
        if (window.maildesk) await window.maildesk.rendererReady();
      })();
    });
    return () => cancelAnimationFrame(frame);
    // Initialization intentionally runs once; refresh uses the state established by this boot sequence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => localStorage.setItem(STORAGE.read, JSON.stringify(readIds)), [readIds]);
  useEffect(() => localStorage.setItem(STORAGE.starred, JSON.stringify(starredIds)), [starredIds]);
  useEffect(() => localStorage.setItem(STORAGE.archived, JSON.stringify(archivedIds)), [archivedIds]);
  useEffect(() => localStorage.setItem(STORAGE.trashed, JSON.stringify(trashedIds)), [trashedIds]);
  useEffect(() => localStorage.setItem(STORAGE.deleted, JSON.stringify(deletedIds)), [deletedIds]);

  useEffect(() => {
    if (!composeOpen) return;
    const composeSignature = signatureForSender(identities, compose.from, signature);

    if (!hasComposeContent(compose, composeSignature)) {
      if (window.maildesk && currentDraftId) {
        void window.maildesk.deleteDraft(currentDraftId).then(() => {
          setDrafts((items) => items.filter((item) => item.id !== currentDraftId));
        });
      } else if (!window.maildesk) {
        localStorage.removeItem(STORAGE.draft);
      }
      return;
    }

    const draft = {
      id: currentDraftId,
      from: compose.from,
      to: compose.to,
      cc: compose.cc,
      bcc: compose.bcc,
      subject: compose.subject,
      text: compose.text,
      html: compose.html,
      replyToMessageId: compose.replyToMessageId,
      replyReferences: compose.replyReferences,
      attachments: compose.attachments,
    };

    if (window.maildesk && currentDraftId) {
      const timer = window.setTimeout(() => {
        void window.maildesk?.saveDraft(draft).then((saved) => {
          setDrafts((items) => [saved as DraftEntry, ...items.filter((item) => item.id !== saved.id)]);
        });
      }, 600);
      return () => window.clearTimeout(timer);
    }

    if (!window.maildesk) {
      localStorage.setItem(STORAGE.draft, JSON.stringify({ ...draft, attachments: [] }));
    }
  }, [activeComposeTabId, compose, composeKind, composeOpen, currentDraftId, identities, showCc, signature]);

  useEffect(() => {
    if (!window.maildesk) return;
    const run = (payload: { action: string; id?: string; folder?: string }) => {
      void handleNativeAction(payload);
    };
    const offContext = window.maildesk.onMailContextAction(run);
    const offApp = window.maildesk.onAppAction(run);
    return () => {
      offContext();
      offApp();
    };
  });

  useEffect(() => {
    if (!window.maildesk) return;
    const offOutbox = window.maildesk.onOutboxUpdated((items) => {
      setOutbox(items as OutboxEntry[]);
    });
    const onOnline = () => {
      void window.maildesk?.processOutbox().then((items) => setOutbox(items as OutboxEntry[]));
    };
    window.addEventListener("online", onOnline);
    return () => {
      offOutbox();
      window.removeEventListener("online", onOnline);
    };
  }, []);

  useEffect(() => {
    if (!window.maildesk || snoozedIds.length === 0) return;
    const timer = window.setInterval(() => {
      void window.maildesk?.getLocalSnapshot().then((snapshot) => {
        setInbox(snapshot.messages.filter((mail) => mail.direction !== "outbound") as MailItem[]);
        setSent(snapshot.messages.filter((mail) => mail.direction === "outbound") as MailItem[]);
        setReadIds(snapshot.readIds);
        setStarredIds(snapshot.starredIds);
            setFlaggedIds(snapshot.flaggedIds ?? []);
            setPinnedIds(snapshot.pinnedIds ?? []);
        setArchivedIds(snapshot.archivedIds);
        setTrashedIds(snapshot.trashedIds);
        setJunkIds(snapshot.junkIds ?? []);
        setSnoozedIds(snapshot.snoozedIds ?? []);
        setDeletedIds(snapshot.deletedIds);
      });
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [snoozedIds.length]);

  useEffect(() => {
    if (!undoSend) return;
    const remaining = Math.max(0, undoSend.expiresAt - Date.now());
    const timer = window.setTimeout(() => setUndoSend(null), remaining + 400);
    return () => window.clearTimeout(timer);
  }, [undoSend]);

  useEffect(() => {
    const term = search.trim();
    const timer = window.setTimeout(() => {
      if (!term || !window.maildesk) {
        setLocalSearchIds(null);
        return;
      }
      void window.maildesk.searchLocalMail(term, 250)
        .then((items) => setLocalSearchIds(items.map((item) => item.id)))
        .catch(() => setLocalSearchIds(null));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const editing = target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || (target instanceof HTMLElement && target.isContentEditable);
      const command = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (command && key === "n") {
        event.preventDefault();
        startCompose();
        return;
      }
      if (command && key === "e") {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (command && key === "1") {
        event.preventDefault();
        setFolder("inbox");
        return;
      }
      if (command && key === "2") {
        event.preventDefault();
        setFolder("sent");
        return;
      }
      if (command && key === "3") {
        event.preventDefault();
        setFolder("archive");
        return;
      }
      if (command && key === "4") {
        event.preventDefault();
        setFolder("trash");
        return;
      }
      if (command && key === "5") {
        event.preventDefault();
        void openContacts();
        return;
      }
      if (event.key === "F5") {
        event.preventDefault();
        void refresh();
        return;
      }

      if (composeOpen || settingsOpen || contactsOpen || calendarOpen) return;

      if (event.key === "Escape" && multiSelectEnabled) {
        event.preventDefault();
        setSelectedIds([]);
        setMultiSelectEnabled(false);
        return;
      }

      if (command && key === "a" && multiSelectEnabled && !editing) {
        event.preventDefault();
        setSelectedIds(currentConversationItems.map((mail) => mail.id));
        return;
      }

      if (event.key === "Delete" && multiSelectEnabled && selectedMailItems().length > 0 && !editing) {
        event.preventDefault();
        bulkTrashSelected();
        return;
      }

      if (!selected) return;

      if (command && key === "r") {
        event.preventDefault();
        void startReplyFor(selected, event.shiftKey);
        return;
      }
      if (command && key === "f") {
        event.preventDefault();
        void startForwardFor(selected);
        return;
      }
      if (command && key === "p") {
        event.preventDefault();
        void printCurrentConversation();
        return;
      }
      if (command && key === "u") {
        event.preventDefault();
        markRead(selected.id, false);
        return;
      }

      if (event.key !== "Delete" || editing) return;
      event.preventDefault();
      if (folder === "trash") {
        setDeletedIds((ids) => addId(ids, selected.id));
        setTrashedIds((ids) => removeId(ids, selected.id));
        setArchivedIds((ids) => removeId(ids, selected.id));
        setStarredIds((ids) => removeId(ids, selected.id));
        void window.maildesk?.updateLocalMailState({ id: selected.id, patch: { isDeleted: true, isStarred: false } });
      } else {
        setTrashedIds((ids) => addId(ids, selected.id));
        setArchivedIds((ids) => removeId(ids, selected.id));
        void window.maildesk?.updateLocalMailState({ id: selected.id, patch: { folder: "trash", isDeleted: false } });
      }
      setSelected(null);
      setDetail(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // The handlers intentionally follow the current UI state and are re-bound when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarOpen, composeOpen, contactsOpen, folder, multiSelectEnabled, selected, selectedIds, settingsOpen]);

  async function cacheMissingBodies(ids: string[]) {
    if (!window.maildesk || !ids.length) return;
    const queue = [...ids];
    const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
      while (queue.length) {
        const id = queue.shift();
        if (!id) break;
        try {
          const response = await fetch(`/api/mail/inbox/${id}`, { cache: "no-store" });
          if (!response.ok) continue;
          const json = await response.json();
          if (json.email) await window.maildesk?.cacheMailDetail({ mail: json.email, direction: "inbound" });
        } catch {
          // Background hydration is best-effort; the summary remains available locally.
        }
      }
    });
    await Promise.all(workers);
    const snapshot = await window.maildesk.getLocalSnapshot();
    const cachedInbox = snapshot.messages.filter((mail) => mail.direction !== "outbound") as MailItem[];
    const cachedSent = snapshot.messages.filter((mail) => mail.direction === "outbound") as MailItem[];
    setInbox((current) => mergeMailLists(current, cachedInbox));
    setSent((current) => mergeMailLists(current, cachedSent));
    void window.maildesk.syncNow();
  }

  async function refresh() {
    if (refreshRunningRef.current) return;
    refreshRunningRef.current = true;
    setLoading(true);
    setError("");
    try {
      const [inboxRes, sentRes] = await Promise.all([
        fetch("/api/mail/inbox", { cache: "no-store" }),
        fetch("/api/mail/sent", { cache: "no-store" }),
      ]);
      const inboxJson = await inboxRes.json();
      const sentJson = await sentRes.json();
      if (!inboxRes.ok) throw new Error(inboxJson.error || "Impossible de charger la boîte de réception");
      if (!sentRes.ok) throw new Error(sentJson.error || "Impossible de charger les éléments envoyés");

      const nextInbox = (inboxJson.emails ?? []) as MailItem[];
      const nextSent = (sentJson.emails ?? []) as MailItem[];
      knownInboxIdsRef.current = new Set(nextInbox.map((mail) => mail.id));
      setInbox(nextInbox);
      setSent(nextSent);

      if (window.maildesk) {
        const snapshot = await window.maildesk.cacheMailLists({ inbox: nextInbox, sent: nextSent });
        const cachedInbox = snapshot.messages.filter((mail) => mail.direction !== "outbound") as MailItem[];
        const cachedSent = snapshot.messages.filter((mail) => mail.direction === "outbound") as MailItem[];
        setInbox(mergeMailLists(nextInbox, cachedInbox));
        setSent(mergeMailLists(nextSent, cachedSent));
        setReadIds(snapshot.readIds);
        setStarredIds(snapshot.starredIds);
        setFlaggedIds(snapshot.flaggedIds ?? []);
        setPinnedIds(snapshot.pinnedIds ?? []);
        setArchivedIds(snapshot.archivedIds);
        setTrashedIds(snapshot.trashedIds);
        setJunkIds(snapshot.junkIds ?? []);
        setSnoozedIds(snapshot.snoozedIds ?? []);
        setDeletedIds(snapshot.deletedIds);
        void cacheMissingBodies(snapshot.missingBodyIds);
        void window.maildesk.syncNow().then(async () => {
          setCustomFolders(await window.maildesk!.listCustomFolders() as CustomFolderEntry[]);
        });
        void window.maildesk.processOutbox().then((items) => setOutbox(items as OutboxEntry[]));
      }
    } catch (err) {
      if (window.maildesk) {
        try {
          const snapshot = await window.maildesk.getLocalSnapshot();
          setInbox(snapshot.messages.filter((mail) => mail.direction !== "outbound") as MailItem[]);
          setSent(snapshot.messages.filter((mail) => mail.direction === "outbound") as MailItem[]);
          setReadIds(snapshot.readIds);
          setStarredIds(snapshot.starredIds);
          setFlaggedIds(snapshot.flaggedIds ?? []);
          setPinnedIds(snapshot.pinnedIds ?? []);
          setArchivedIds(snapshot.archivedIds);
          setTrashedIds(snapshot.trashedIds);
          setJunkIds(snapshot.junkIds ?? []);
          setSnoozedIds(snapshot.snoozedIds ?? []);
          setDeletedIds(snapshot.deletedIds);
          setError(`Mode local hors ligne — ${err instanceof Error ? err.message : "Resend indisponible"}`);
        } catch {
          setError(err instanceof Error ? err.message : "Erreur de chargement");
        }
      } else {
        setError(err instanceof Error ? err.message : "Erreur de chargement");
      }
    } finally {
      setLoading(false);
      refreshRunningRef.current = false;
    }
  }

  function sourceFolder(mail: MailItem) {
    return sent.some((item) => item.id === mail.id) ? "sent" : "inbox";
  }

  async function getMailDetail(mail: MailItem, updatePane = true) {
    const known = threadDetails[mail.id] || (detail?.id === mail.id ? detail : undefined);
    if (known) {
      if (updatePane) {
        setSelected(mail);
        setDetail(known);
      }
      return known;
    }

    if (updatePane) {
      setSelected(mail);
      setDetail(null);
      setDetailLoading(true);
    }

    try {
      const folderName = sourceFolder(mail);
      const response = await fetch(`/api/mail/${folderName}/${mail.id}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Impossible d'ouvrir le message");
      const remote = json.email as MailDetail;
      const loaded: MailDetail = {
        ...mail,
        ...remote,
        headers: remote.headers ?? mail.headers,
        in_reply_to: remote.in_reply_to ?? mail.in_reply_to,
        references: remote.references?.length ? remote.references : (mail.references ?? []),
      };

      setThreadDetails((current) => ({ ...current, [mail.id]: loaded }));
      if (folderName === "sent") {
        setSent((current) => mergeMailLists(current, [loaded]));
      } else {
        setInbox((current) => mergeMailLists(current, [loaded]));
      }

      if (window.maildesk) {
        void window.maildesk.cacheMailDetail({ mail: loaded, direction: folderName === "sent" ? "outbound" : "inbound" });
      }
      if (updatePane) setDetail(loaded);
      return loaded;
    } catch (err) {
      if (window.maildesk) {
        const cached = await window.maildesk.getLocalMail(mail.id);
        if (cached) {
          const local = cached as MailDetail;
          setThreadDetails((current) => ({ ...current, [mail.id]: local }));
          if (updatePane) setDetail(local);
          setError("Message affiché depuis la base locale.");
          return local;
        }
      }
      setError(err instanceof Error ? err.message : "Erreur de lecture");
      return null;
    } finally {
      if (updatePane) setDetailLoading(false);
    }
  }

  function persistLocalState(id: string, patch: { folder?: string; isRead?: boolean; isStarred?: boolean; isFlagged?: boolean; isPinned?: boolean; isDeleted?: boolean; category?: string; snoozedUntil?: string | null }) {
    if (!window.maildesk) return;
    void window.maildesk.updateLocalMailState({ id, patch }).then(() => window.maildesk?.syncNow());
  }

  async function openMail(mail: MailItem) {
    setActiveReadingTab("mail");
    setExpandedThreadIds([mail.id]);
    setReadIds((ids) => addId(ids, mail.id));
    persistLocalState(mail.id, { isRead: true });
    await getMailDetail(mail, true);
  }

  async function toggleThreadMessage(mail: MailItem) {
    const isExpanded = expandedThreadIds.includes(mail.id);
    if (isExpanded) {
      setExpandedThreadIds((ids) => ids.filter((id) => id !== mail.id));
      return;
    }

    setExpandedThreadIds((ids) => addId(ids, mail.id));
    if (sourceFolder(mail) !== "sent") {
      setReadIds((ids) => addId(ids, mail.id));
      persistLocalState(mail.id, { isRead: true });
    }
    await getMailDetail(mail, false);
  }

  function clearReadingPane(id: string) {
    if (selected?.id !== id) return;
    setSelected(null);
    setDetail(null);
  }

  function toggleStar(id: string) {
    const next = !starredIds.includes(id);
    setStarredIds((ids) => next ? addId(ids, id) : removeId(ids, id));
    persistLocalState(id, { isStarred: next });
  }

  function toggleFlag(id: string) {
    const next = !flaggedIds.includes(id);
    setFlaggedIds((ids) => next ? addId(ids, id) : removeId(ids, id));
    setInbox((items) => items.map((item) => item.id === id ? { ...item, localFlagged: next } : item));
    setSent((items) => items.map((item) => item.id === id ? { ...item, localFlagged: next } : item));
    persistLocalState(id, { isFlagged: next });
  }

  function togglePin(id: string) {
    const next = !pinnedIds.includes(id);
    setPinnedIds((ids) => next ? addId(ids, id) : removeId(ids, id));
    setInbox((items) => items.map((item) => item.id === id ? { ...item, localPinned: next } : item));
    setSent((items) => items.map((item) => item.id === id ? { ...item, localPinned: next } : item));
    persistLocalState(id, { isPinned: next });
  }

  function toggleSelectedId(id: string) {
    const visibleIds = new Set(currentConversationItems.map((mail) => mail.id));
    setSelectedIds((ids) => {
      const scoped = ids.filter((itemId) => visibleIds.has(itemId));
      return scoped.includes(id) ? removeId(scoped, id) : addId(scoped, id);
    });
  }

  function markRead(id: string, read: boolean) {
    setReadIds((ids) => read ? addId(ids, id) : removeId(ids, id));
    persistLocalState(id, { isRead: read });
  }

  function updateMailMetadata(id: string, patch: Partial<Pick<MailItem, "category" | "snoozedUntil">>) {
    setInbox((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
    setSent((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
    setDetail((current) => current?.id === id ? { ...current, ...patch } : current);
    setThreadDetails((current) => current[id] ? { ...current, [id]: { ...current[id], ...patch } } : current);
  }

  function setMailCategory(mail: MailItem, category: string) {
    updateMailMetadata(mail.id, { category: category || undefined });
    persistLocalState(mail.id, { category });
  }

  function snoozeMail(mail: MailItem, until: Date) {
    const snoozedUntil = until.toISOString();
    setSnoozedIds((ids) => addId(ids, mail.id));
    setArchivedIds((ids) => removeId(ids, mail.id));
    setTrashedIds((ids) => removeId(ids, mail.id));
    setJunkIds((ids) => removeId(ids, mail.id));
    updateMailMetadata(mail.id, { snoozedUntil });
    persistLocalState(mail.id, { folder: "snoozed", snoozedUntil, isDeleted: false });
    if (folder !== "snoozed") clearReadingPane(mail.id);
  }

  function restoreSnoozedMail(mail: MailItem) {
    setSnoozedIds((ids) => removeId(ids, mail.id));
    updateMailMetadata(mail.id, { snoozedUntil: undefined });
    persistLocalState(mail.id, { folder: sourceFolder(mail) === "sent" ? "sent" : "inbox", snoozedUntil: null, isDeleted: false });
    if (folder === "snoozed") clearReadingPane(mail.id);
  }

  function moveToJunk(mail: MailItem) {
    setJunkIds((ids) => addId(ids, mail.id));
    setSnoozedIds((ids) => removeId(ids, mail.id));
    setArchivedIds((ids) => removeId(ids, mail.id));
    setTrashedIds((ids) => removeId(ids, mail.id));
    updateMailMetadata(mail.id, { snoozedUntil: undefined });
    persistLocalState(mail.id, { folder: "junk", snoozedUntil: null, isDeleted: false });
    if (folder !== "junk") clearReadingPane(mail.id);
  }

  function restoreFromJunk(mail: MailItem) {
    setJunkIds((ids) => removeId(ids, mail.id));
    persistLocalState(mail.id, { folder: sourceFolder(mail) === "sent" ? "sent" : "inbox", isDeleted: false });
    if (folder === "junk") clearReadingPane(mail.id);
  }

  async function blockMailSender(mail: MailItem) {
    if (window.maildesk && mail.from) {
      try {
        await window.maildesk.blockSender(mail.from);
        const [blocked, snapshot] = await Promise.all([
          window.maildesk.listBlockedSenders(),
          window.maildesk.getLocalSnapshot(),
        ]);
        setBlockedSenders(blocked);
        setInbox(snapshot.messages.filter((item) => item.direction !== "outbound") as MailItem[]);
        setSent(snapshot.messages.filter((item) => item.direction === "outbound") as MailItem[]);
        setReadIds(snapshot.readIds);
        setStarredIds(snapshot.starredIds);
            setFlaggedIds(snapshot.flaggedIds ?? []);
            setPinnedIds(snapshot.pinnedIds ?? []);
        setArchivedIds(snapshot.archivedIds);
        setTrashedIds(snapshot.trashedIds);
        setJunkIds(snapshot.junkIds ?? []);
        setSnoozedIds(snapshot.snoozedIds ?? []);
        setDeletedIds(snapshot.deletedIds);
        clearReadingPane(mail.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Impossible de bloquer cet expéditeur.");
        return;
      }
    } else {
      moveToJunk(mail);
    }
    setError(`${senderEmail(mail.from) || "Cet expéditeur"} est maintenant bloqué.`);
  }

  async function unblockMailSender(email: string) {
    if (!window.maildesk) return;
    await window.maildesk.unblockSender(email);
    setBlockedSenders(await window.maildesk.listBlockedSenders());
    setSettingsMessage(`${email} a été débloqué.`);
  }

  function archiveMail(mail: MailItem) {
    setArchivedIds((ids) => addId(ids, mail.id));
    setTrashedIds((ids) => removeId(ids, mail.id));
    setJunkIds((ids) => removeId(ids, mail.id));
    setSnoozedIds((ids) => removeId(ids, mail.id));
    updateMailMetadata(mail.id, { snoozedUntil: undefined });
    persistLocalState(mail.id, { folder: "archive", snoozedUntil: null, isDeleted: false });
    if (folder !== "archive") clearReadingPane(mail.id);
  }

  function trashMail(mail: MailItem) {
    setTrashedIds((ids) => addId(ids, mail.id));
    setArchivedIds((ids) => removeId(ids, mail.id));
    setJunkIds((ids) => removeId(ids, mail.id));
    setSnoozedIds((ids) => removeId(ids, mail.id));
    setPinnedIds((ids) => removeId(ids, mail.id));
    updateMailMetadata(mail.id, { snoozedUntil: undefined });
    persistLocalState(mail.id, { folder: "trash", snoozedUntil: null, isPinned: false, isDeleted: false });
    if (folder !== "trash") clearReadingPane(mail.id);
  }

  function restoreMail(mail: MailItem) {
    const targetFolder = sourceFolder(mail) === "sent" ? "sent" : "inbox";
    setTrashedIds((ids) => removeId(ids, mail.id));
    setArchivedIds((ids) => removeId(ids, mail.id));
    setJunkIds((ids) => removeId(ids, mail.id));
    setSnoozedIds((ids) => removeId(ids, mail.id));
    setInbox((items) => items.map((item) => item.id === mail.id ? { ...item, localFolder: targetFolder } : item));
    setSent((items) => items.map((item) => item.id === mail.id ? { ...item, localFolder: targetFolder } : item));
    updateMailMetadata(mail.id, { snoozedUntil: undefined });
    persistLocalState(mail.id, { folder: targetFolder, snoozedUntil: null, isDeleted: false });
    if (folder === "trash" || folder === "archive" || folder.startsWith("custom:")) clearReadingPane(mail.id);
  }

  function deleteForever(mail: MailItem) {
    setDeletedIds((ids) => addId(ids, mail.id));
    setTrashedIds((ids) => removeId(ids, mail.id));
    setArchivedIds((ids) => removeId(ids, mail.id));
    setJunkIds((ids) => removeId(ids, mail.id));
    setSnoozedIds((ids) => removeId(ids, mail.id));
    setStarredIds((ids) => removeId(ids, mail.id));
    setFlaggedIds((ids) => removeId(ids, mail.id));
    setPinnedIds((ids) => removeId(ids, mail.id));
    persistLocalState(mail.id, { isDeleted: true, isStarred: false, isFlagged: false, isPinned: false });
    clearReadingPane(mail.id);
  }

  function selectedMailItems() {
    const selectedSet = new Set(selectedIds);
    return currentConversationItems.filter((mail) => selectedSet.has(mail.id));
  }

  function bulkTrashSelected() {
    const items = selectedMailItems();
    if (!items.length) return;
    items.forEach((mail) => folder === "trash" ? deleteForever(mail) : trashMail(mail));
    setSelectedIds([]);
  }

  function bulkFlagSelected() {
    const items = selectedMailItems();
    if (!items.length) return;
    const shouldFlag = items.some((mail) => !flaggedIds.includes(mail.id));
    items.forEach((mail) => {
      setFlaggedIds((ids) => shouldFlag ? addId(ids, mail.id) : removeId(ids, mail.id));
      setInbox((rows) => rows.map((item) => item.id === mail.id ? { ...item, localFlagged: shouldFlag } : item));
      setSent((rows) => rows.map((item) => item.id === mail.id ? { ...item, localFlagged: shouldFlag } : item));
      persistLocalState(mail.id, { isFlagged: shouldFlag });
    });
  }

  function bulkPinSelected() {
    const items = selectedMailItems();
    if (!items.length) return;
    const shouldPin = items.some((mail) => !pinnedIds.includes(mail.id));
    items.forEach((mail) => {
      setPinnedIds((ids) => shouldPin ? addId(ids, mail.id) : removeId(ids, mail.id));
      setInbox((rows) => rows.map((item) => item.id === mail.id ? { ...item, localPinned: shouldPin } : item));
      setSent((rows) => rows.map((item) => item.id === mail.id ? { ...item, localPinned: shouldPin } : item));
      persistLocalState(mail.id, { isPinned: shouldPin });
    });
  }

  function composeTabLabel(kind: ComposeKind, state: ComposeState) {
    const base = kind === "reply"
      ? "Réponse"
      : kind === "replyAll"
        ? "Réponse à tous"
        : kind === "forward"
          ? "Transfert"
          : kind === "draft"
            ? "Brouillon"
            : "Nouveau message";
    return state.subject.trim() ? `${base} · ${state.subject.trim()}` : base;
  }

  function activeComposeSnapshot(): ComposeTabEntry | null {
    if (!composeOpen || !activeComposeTabId) return null;
    return {
      id: activeComposeTabId,
      draftId: currentDraftId || globalThis.crypto.randomUUID(),
      kind: composeKind,
      compose: { ...compose, attachments: [...compose.attachments] },
      showCc,
    };
  }

  function loadComposeTab(tab: ComposeTabEntry) {
    setActiveComposeTabId(tab.id);
    setCurrentDraftId(tab.draftId);
    setComposeKind(tab.kind);
    setCompose({ ...tab.compose, attachments: [...tab.compose.attachments] });
    setShowCc(tab.showCc);
    setComposeOpen(true);
    setActiveReadingTab("compose");
    setSidebarOpen(false);
  }

  async function persistComposeTab(tab: ComposeTabEntry, quiet = true) {
    const composeSignature = signatureForSender(identities, tab.compose.from, signature);
    if (!hasComposeContent(tab.compose, composeSignature)) return;

    const draft = {
      id: tab.draftId,
      from: tab.compose.from,
      to: tab.compose.to,
      cc: tab.compose.cc,
      bcc: tab.compose.bcc,
      subject: tab.compose.subject,
      text: tab.compose.text,
      html: tab.compose.html,
      replyToMessageId: tab.compose.replyToMessageId,
      replyReferences: tab.compose.replyReferences,
      attachments: tab.compose.attachments,
    };

    if (window.maildesk) {
      const saved = await window.maildesk.saveDraft(draft);
      setDrafts((items) => [saved as DraftEntry, ...items.filter((item) => item.id !== saved.id)]);
    } else {
      localStorage.setItem(STORAGE.draft, JSON.stringify({ ...draft, attachments: [] }));
    }
    if (!quiet) setError("Brouillon enregistré.");
  }

  async function snapshotAndPersistActiveCompose() {
    const snapshot = activeComposeSnapshot();
    if (!snapshot) return;
    setComposeTabs((items) => items.map((item) => item.id === snapshot.id ? snapshot : item));
    await persistComposeTab(snapshot);
  }

  async function openComposeWorkspaceTab(
    kind: ComposeKind,
    nextCompose: ComposeState,
    nextShowCc = false,
    draftId = globalThis.crypto.randomUUID(),
  ) {
    const current = activeComposeSnapshot();
    if (current) {
      setComposeTabs((items) => items.map((item) => item.id === current.id ? current : item));
      await persistComposeTab(current);
    }

    const tab: ComposeTabEntry = {
      id: globalThis.crypto.randomUUID(),
      draftId,
      kind,
      compose: { ...nextCompose, attachments: [...nextCompose.attachments] },
      showCc: nextShowCc,
    };
    setComposeTabs((items) => [...items, tab]);
    loadComposeTab(tab);
  }

  async function switchComposeTab(tabId: string) {
    if (tabId === activeComposeTabId) {
      setActiveReadingTab("compose");
      return;
    }
    await snapshotAndPersistActiveCompose();
    const target = composeTabs.find((item) => item.id === tabId);
    if (target) loadComposeTab(target);
  }

  async function closeComposeTab(tabId: string) {
    const current = activeComposeSnapshot();
    const stored = composeTabs.find((item) => item.id === tabId);
    const tab = current?.id === tabId ? current : stored;
    if (tab) await persistComposeTab(tab);

    const remaining = composeTabs.filter((item) => item.id !== tabId);
    setComposeTabs(remaining);

    if (tabId !== activeComposeTabId) return;
    const fallback = remaining[remaining.length - 1];
    if (fallback) {
      loadComposeTab(fallback);
      return;
    }

    setActiveComposeTabId("");
    setCurrentDraftId("");
    setCompose({ ...EMPTY_COMPOSE, attachments: [] });
    setComposeOpen(false);
    setActiveReadingTab("mail");
  }

  function finishActiveComposeTab() {
    const remaining = composeTabs.filter((item) => item.id !== activeComposeTabId);
    setComposeTabs(remaining);
    const fallback = remaining[remaining.length - 1];
    if (fallback) {
      loadComposeTab(fallback);
      return;
    }
    setActiveComposeTabId("");
    setCurrentDraftId("");
    setCompose({ ...EMPTY_COMPOSE, attachments: [] });
    setComposeOpen(false);
    setActiveReadingTab("mail");
  }

  async function openSavedDraft(draft: DraftEntry) {
    const existing = composeTabs.find((item) => item.draftId === draft.id);
    if (existing) {
      await switchComposeTab(existing.id);
      return;
    }
    const nextCompose = {
      ...EMPTY_COMPOSE,
      from: draft.from,
      to: draft.to,
      cc: draft.cc,
      bcc: draft.bcc,
      subject: draft.subject,
      text: draft.text,
      html: draft.html,
      replyToMessageId: draft.replyToMessageId,
      replyReferences: draft.replyReferences,
      attachments: draft.attachments ?? [],
    };
    await openComposeWorkspaceTab("draft", nextCompose, Boolean(draft.cc || draft.bcc), draft.id);
  }

  async function deleteDraftEntry(id: string) {
    if (window.maildesk) await window.maildesk.deleteDraft(id);
    setDrafts((items) => items.filter((item) => item.id !== id));
    const tab = composeTabs.find((item) => item.draftId === id);
    if (!tab) return;

    const remaining = composeTabs.filter((item) => item.id !== tab.id);
    setComposeTabs(remaining);
    if (tab.id !== activeComposeTabId) return;

    const fallback = remaining[remaining.length - 1];
    if (fallback) {
      loadComposeTab(fallback);
      return;
    }
    setActiveComposeTabId("");
    setCurrentDraftId("");
    setCompose({ ...EMPTY_COMPOSE, attachments: [] });
    setComposeOpen(false);
    setActiveReadingTab("mail");
  }

  async function startCompose() {
    const defaultIdentity = defaultIdentityOf(identities, settingsFrom, signature);
    const composeSignature = defaultIdentity?.signature || signature;
    const nextCompose: ComposeState = {
      ...EMPTY_COMPOSE,
      from: defaultIdentity?.from || settingsFrom,
      text: composeSignature ? `\n\n${signatureToText(composeSignature)}` : "",
      html: signatureToHtml(composeSignature),
      attachments: [],
    };
    await openComposeWorkspaceTab("new", nextCompose);
  }

  function closeCompose() {
    if (activeComposeTabId) void closeComposeTab(activeComposeTabId);
  }

  async function saveCurrentDraft(options: { quiet?: boolean } = {}) {
    const snapshot = activeComposeSnapshot();
    if (!snapshot) return;

    const composeSignature = signatureForSender(identities, snapshot.compose.from, signature);
    if (!hasComposeContent(snapshot.compose, composeSignature)) {
      if (!options.quiet) setError("Ajoutez un destinataire, un objet ou du contenu avant de créer le brouillon.");
      return;
    }

    setComposeTabs((items) => items.map((item) => item.id === snapshot.id ? snapshot : item));
    await persistComposeTab(snapshot, Boolean(options.quiet));
  }

  async function loadConversationForExport() {
    const source = selectedConversation.length ? selectedConversation : (detail ? [detail] : []);
    if (!source.length) return [] as MailDetail[];

    const loaded = await Promise.all(source.map(async (mail) => {
      const known = threadDetails[mail.id] || (detail?.id === mail.id ? detail : undefined);
      return known || await getMailDetail(mail, false);
    }));
    return loaded.filter((message): message is MailDetail => Boolean(message));
  }

  async function printCurrentConversation() {
    if (!window.maildesk || !detail) return;
    try {
      const messages = await loadConversationForExport();
      if (!messages.length) throw new Error("Aucun message à imprimer.");
      const result = await window.maildesk.printDocument({
        title: messages[messages.length - 1]?.subject || "Conversation MailDesk",
        html: buildPrintableConversationDocument(messages),
      });
      if (!result.ok && !result.canceled) {
        setError(result.message || "Impossible d’imprimer la conversation.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d’imprimer la conversation.");
    }
  }

  async function exportCurrentConversationPdf() {
    if (!window.maildesk || !detail) return;
    try {
      const messages = await loadConversationForExport();
      if (!messages.length) throw new Error("Aucun message à exporter.");
      const result = await window.maildesk.exportPdf({
        title: messages[messages.length - 1]?.subject || "Conversation MailDesk",
        html: buildPrintableConversationDocument(messages),
      });
      if (result.ok && result.path) setError(`PDF exporté : ${result.path}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d’exporter le PDF.");
    }
  }

  async function exportCurrentMessageEml() {
    if (!window.maildesk || !detail) return;
    try {
      const message = await getMailDetail(detail, false);
      if (!message) throw new Error("Message indisponible.");
      const result = await window.maildesk.exportEml({
        title: message.subject || "message",
        folder: sourceFolder(message),
        message,
      });
      if (result.ok && result.path) setError(`Message EML exporté : ${result.path}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d’exporter le message EML.");
    }
  }

  async function startReplyFor(mail: MailItem, replyAll = false) {
    const message = await getMailDetail(mail, false);
    if (!message) return;
    const fromSentFolder = sourceFolder(mail) === "sent";
    const replyAddress = fromSentFolder
      ? (message.to ?? []).join(", ")
      : (message.reply_to?.[0] || senderEmail(message.from));
    const cc = replyAll ? (message.cc ?? []).join(", ") : "";
    const defaultIdentity = defaultIdentityOf(identities, settingsFrom, signature);
    const replyIdentity = fromSentFolder
      ? (findIdentityForAddresses(identities, [message.from || ""]) || defaultIdentity)
      : (findIdentityForAddresses(identities, [...(message.to ?? []), ...(message.cc ?? [])]) || defaultIdentity);
    const replySignature = replyIdentity?.signature || signature;
    const originalText = message.text?.trim() || "[Message HTML original]";
    const replyLead = `\n\nLe ${message.created_at ? new Date(message.created_at).toLocaleString("fr-FR") : ""}, ${message.from || ""} a écrit :\n${originalText}`;
    const originalHtml = message.html || `<pre>${escapeHtml(originalText)}</pre>`;
    const nextCompose: ComposeState = {
      ...EMPTY_COMPOSE,
      from: replyIdentity?.from || settingsFrom,
      to: replyAddress,
      cc,
      subject: normalizeSubject("Re", message.subject),
      text: `${replySignature ? `\n\n${signatureToText(replySignature)}` : ""}${replyLead}`,
      html: `${signatureToHtml(replySignature)}<br><div class="maildesk-quote-head">Le ${message.created_at ? new Date(message.created_at).toLocaleString("fr-FR") : ""}, ${escapeHtml(message.from || "")} a écrit :</div><blockquote>${originalHtml}</blockquote>`,
      replyToMessageId: message.message_id,
      replyReferences: replyReferencesFor(message),
      attachments: [],
    };
    await openComposeWorkspaceTab(replyAll ? "replyAll" : "reply", nextCompose, replyAll && Boolean(cc));
  }

  async function startForwardFor(mail: MailItem) {
    const message = await getMailDetail(mail, false);
    if (!message) return;
    const original = message.text?.trim() || "[Message HTML original]";
    const forwardedText = [
      "",
      "",
      "---------- Message transféré ----------",
      `De : ${message.from || ""}`,
      `Date : ${message.created_at ? new Date(message.created_at).toLocaleString("fr-FR") : ""}`,
      `Objet : ${message.subject || ""}`,
      `À : ${(message.to ?? []).join(", ")}`,
      "",
      original,
    ].join("\n");
    const forwardMeta = [
      `<strong>De :</strong> ${escapeHtml(message.from || "")}`,
      `<strong>Date :</strong> ${escapeHtml(message.created_at ? new Date(message.created_at).toLocaleString("fr-FR") : "")}`,
      `<strong>Objet :</strong> ${escapeHtml(message.subject || "")}`,
      `<strong>À :</strong> ${escapeHtml((message.to ?? []).join(", "))}`,
    ].join("<br>");
    const originalHtml = message.html || `<pre>${escapeHtml(original)}</pre>`;
    const defaultIdentity = defaultIdentityOf(identities, settingsFrom, signature);
    const forwardSignature = defaultIdentity?.signature || signature;
    const nextCompose: ComposeState = {
      ...EMPTY_COMPOSE,
      from: defaultIdentity?.from || settingsFrom,
      subject: normalizeSubject("TR", message.subject),
      text: `${forwardSignature ? `\n\n${signatureToText(forwardSignature)}` : ""}${forwardedText}`,
      html: `${signatureToHtml(forwardSignature)}<br><hr><div>${forwardMeta}</div><br>${originalHtml}`,
      attachments: [],
    };
    await openComposeWorkspaceTab("forward", nextCompose);
  }

  async function handleNativeAction(payload: { action: string; id?: string; folder?: string; to?: string; cc?: string; bcc?: string; subject?: string; text?: string }) {
    if (payload.action === "compose") return startCompose();
    if (payload.action === "compose-mailto") {
      const defaultIdentity = defaultIdentityOf(identities, settingsFrom, signature);
      const composeSignature = defaultIdentity?.signature || signature;
      const mailtoText = payload.text || "";
      const nextCompose: ComposeState = {
        ...EMPTY_COMPOSE,
        from: defaultIdentity?.from || settingsFrom,
        to: payload.to || "",
        cc: payload.cc || "",
        bcc: payload.bcc || "",
        subject: payload.subject || "",
        text: `${mailtoText}${composeSignature ? `\n\n${signatureToText(composeSignature)}` : ""}`,
        html: `${mailtoText ? `<p>${escapeHtml(mailtoText).replace(/\n/g, "<br>")}</p>` : ""}${signatureToHtml(composeSignature)}`,
        attachments: [],
      };
      await openComposeWorkspaceTab("new", nextCompose, Boolean(payload.cc || payload.bcc));
      return;
    }
    if (payload.action === "contacts") return void openContacts();
    if (payload.action === "calendar") return void openCalendar();
    if (payload.action === "settings") return void openSettings();
    if (payload.action === "notification-mark-read" && payload.id) {
      setReadIds((ids) => addId(ids, payload.id!));
      return;
    }
    if (payload.action === "inbox-updated" && window.maildesk) {
      const snapshot = await window.maildesk.getLocalSnapshot();
      setInbox(snapshot.messages.filter((mail) => mail.direction !== "outbound") as MailItem[]);
      setSent(snapshot.messages.filter((mail) => mail.direction === "outbound") as MailItem[]);
      setReadIds(snapshot.readIds);
      setStarredIds(snapshot.starredIds);
      setFlaggedIds(snapshot.flaggedIds ?? []);
      setPinnedIds(snapshot.pinnedIds ?? []);
      setArchivedIds(snapshot.archivedIds);
      setTrashedIds(snapshot.trashedIds);
      setJunkIds(snapshot.junkIds ?? []);
      setSnoozedIds(snapshot.snoozedIds ?? []);
      setDeletedIds(snapshot.deletedIds);
      void cacheMissingBodies(snapshot.missingBodyIds);
      return;
    }
    if (payload.action === "open-mail-by-id" && payload.id) {
      let target = allMail.find((item) => item.id === payload.id);
      if (!target && window.maildesk) {
        const local = await window.maildesk.getLocalMail(payload.id) as MailItem | null;
        if (local) {
          target = local;
          if ((local as MailItem & { direction?: string }).direction === "outbound") {
            setSent((items) => mergeMailLists(items, [local]));
          } else {
            setInbox((items) => mergeMailLists(items, [local]));
          }
        }
      }
      if (target) await openMail(target);
      return;
    }
    if (payload.action === "update-ready") {
      await openSettings();
      setSettingsTab("updates");
      setUpdateStatusMessage(payload.text || "Une mise à jour est prête à être installée.");
      return;
    }
    if (payload.action === "backup-export") return void exportLocalBackup();
    if (payload.action === "backup-restore") return void restoreLocalBackup();
    if (payload.action === "data-folder") return void openLocalDataFolder();
    if (payload.action === "outbox-sent") {
      if (window.maildesk) setOutbox(await window.maildesk.getOutbox() as OutboxEntry[]);
      await refresh();
      return;
    }
    if (payload.action === "refresh") return void refresh();
    if (payload.action === "search") return searchRef.current?.focus();
    if (payload.action === "folder" && payload.folder) {
      setFolder(payload.folder as Folder);
      setSelected(null);
      setDetail(null);
      return;
    }

    const mail = payload.id ? allMail.find((item) => item.id === payload.id) : selected;
    if (!mail) return;

    if (payload.action.startsWith("category-")) {
      const category = payload.action.slice("category-".length);
      setMailCategory(mail, category === "clear" ? "" : category);
      return;
    }

    if (payload.action.startsWith("move-folder:")) {
      const targetId = payload.action.slice("move-folder:".length);
      await moveMailToCustomFolder(mail.id, targetId);
      return;
    }

    if (payload.action === "snooze-1h") {
      snoozeMail(mail, new Date(Date.now() + 60 * 60 * 1000));
      return;
    }
    if (payload.action === "snooze-tomorrow") {
      const date = new Date();
      date.setDate(date.getDate() + 1);
      date.setHours(8, 0, 0, 0);
      snoozeMail(mail, date);
      return;
    }
    if (payload.action === "snooze-week") {
      const date = new Date();
      date.setDate(date.getDate() + 7);
      date.setHours(8, 0, 0, 0);
      snoozeMail(mail, date);
      return;
    }

    switch (payload.action) {
      case "reply":
        await startReplyFor(mail);
        break;
      case "reply-all":
        await startReplyFor(mail, true);
        break;
      case "forward":
        await startForwardFor(mail);
        break;
      case "create-rule-from":
        await openRuleBuilderFromMail(mail, "from");
        break;
      case "create-rule-subject":
        await openRuleBuilderFromMail(mail, "subject");
        break;
      case "create-rule-to":
        await openRuleBuilderFromMail(mail, "to");
        break;
      case "print":
        await printCurrentConversation();
        break;
      case "export-pdf":
        await exportCurrentConversationPdf();
        break;
      case "export-eml":
        await exportCurrentMessageEml();
        break;
      case "archive":
        archiveMail(mail);
        break;
      case "delete":
        trashMail(mail);
        break;
      case "restore":
        restoreMail(mail);
        break;
      case "delete-forever":
        deleteForever(mail);
        break;
      case "mark-read":
        markRead(mail.id, true);
        break;
      case "mark-unread":
        markRead(mail.id, false);
        break;
      case "toggle-star":
        toggleStar(mail.id);
        break;
      case "toggle-flag":
        toggleFlag(mail.id);
        break;
      case "toggle-pin":
        togglePin(mail.id);
        break;
      case "junk":
        moveToJunk(mail);
        break;
      case "not-junk":
        restoreFromJunk(mail);
        break;
      case "block-sender":
        await blockMailSender(mail);
        break;
      case "unsnooze":
        restoreSnoozedMail(mail);
        break;
    }
  }

  async function openRuleBuilderFromMail(mail: MailItem, field: MailRuleEntry["field"] = "from") {
    await openSettings();
    const value = field === "from"
      ? senderEmail(mail.from)
      : field === "subject"
        ? (mail.subject || "")
        : (mail.to?.[0] || "");
    setSettingsTab("rules");
    setRuleName(field === "from" ? `Courrier de ${senderName(mail.from)}` : "");
    setRuleConditions([{
      id: globalThis.crypto.randomUUID(),
      field,
      operator: field === "from" ? "equals" : "contains",
      value,
    }]);
    setRuleActions([customFolders.length > 0
      ? { id: globalThis.crypto.randomUUID(), type: "move_to_folder", value: customFolders[0].id }
      : { id: globalThis.crypto.randomUUID(), type: "archive", value: "" }]);
    setRuleMatchMode("all");
    setRulePriority(100);
    setRuleStopProcessing(false);
    setRuleTestResult(null);
    setSettingsMessage("Règle préremplie depuis le message. Vous pouvez ajouter d’autres conditions/actions avant de l’enregistrer.");
  }

  async function showContextMenu(mail: MailItem) {
    if (!window.maildesk) return;
    const effectiveFolder = trashedIds.includes(mail.id)
      ? "trash"
      : junkIds.includes(mail.id)
        ? "junk"
        : snoozedIds.includes(mail.id)
          ? "snoozed"
          : archivedIds.includes(mail.id)
            ? "archive"
            : folder;
    await window.maildesk.showMailContextMenu({
      id: mail.id,
      folder: effectiveFolder,
      isRead: readIds.includes(mail.id),
      isStarred: starredIds.includes(mail.id),
      isFlagged: flaggedIds.includes(mail.id),
      isPinned: pinnedIds.includes(mail.id),
      canBlock: sourceFolder(mail) !== "sent",
    });
  }

  async function addAttachments() {
    setError("");
    try {
      if (window.maildesk) {
        const files = await window.maildesk.pickAttachments();
        setCompose((current) => ({ ...current, attachments: [...current.attachments, ...files] }));
      } else {
        fileInputRef.current?.click();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'ajouter les pièces jointes");
    }
  }

  async function handleBrowserFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    if (!files.length) return;
    try {
      const converted = await Promise.all(files.map(async (file) => {
        if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name} dépasse 20 Mo.`);
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        return {
          name: file.name,
          size: file.size,
          type: file.type,
          content: dataUrl.split(",", 2)[1] || "",
        };
      }));
      setCompose((current) => ({ ...current, attachments: [...current.attachments, ...converted] }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'ajouter les pièces jointes");
    } finally {
      event.target.value = "";
    }
  }

  async function deleteCurrentDraftRecord() {
    if (window.maildesk && currentDraftId) {
      await window.maildesk.deleteDraft(currentDraftId);
      setDrafts((items) => items.filter((item) => item.id !== currentDraftId));
    } else if (!window.maildesk) {
      localStorage.removeItem(STORAGE.draft);
    }
    setCurrentDraftId("");
  }

  async function editOutboxItem(item: OutboxEntry) {
    if (!window.maildesk) return;
    await window.maildesk.deleteOutbox(item.id);
    setOutbox(await window.maildesk.getOutbox() as OutboxEntry[]);
    const nextCompose: ComposeState = {
      ...EMPTY_COMPOSE,
      from: item.from || defaultIdentityOf(identities, settingsFrom, signature)?.from || settingsFrom,
      to: item.to || "",
      cc: item.cc || "",
      bcc: item.bcc || "",
      subject: item.subject || "",
      text: item.text || "",
      html: item.html || "",
      replyToMessageId: item.replyToMessageId,
      replyReferences: item.replyReferences ?? [],
      attachments: item.attachments ?? [],
    };
    await openComposeWorkspaceTab("draft", nextCompose, Boolean(item.cc || item.bcc));
    setError("Message retiré de la boîte d’envoi et rouvert pour modification.");
  }

  async function retryOutboxItem(id: string) {
    if (!window.maildesk) return;
    setError("Nouvelle tentative d’envoi...");
    const items = await window.maildesk.retryOutbox(id);
    setOutbox(items as OutboxEntry[]);
    if (!items.some((item) => item.id === id)) {
      setError("Message envoyé.");
      await refresh();
    }
  }

  async function deleteOutboxItem(id: string) {
    if (!window.maildesk) return;
    if (!window.confirm("Supprimer définitivement ce message de la boîte d’envoi ?")) return;
    await window.maildesk.deleteOutbox(id);
    setOutbox(await window.maildesk.getOutbox() as OutboxEntry[]);
    setError("Message supprimé de la boîte d’envoi.");
  }

  async function queueMessageForSend(
    payload: ComposeState & { idempotencyKey: string },
    sendAt: string,
    undoable: boolean,
  ) {
    if (!window.maildesk) throw new Error("La planification nécessite l’application Electron.");

    const queued = await window.maildesk.enqueueOutbox({ ...payload, sendAt });
    await deleteCurrentDraftRecord();
    setOutbox(await window.maildesk.getOutbox() as OutboxEntry[]);
    finishActiveComposeTab();
    setScheduleOpen(false);

    if (undoable) {
      setUndoSend({
        item: queued as OutboxEntry,
        expiresAt: new Date(sendAt).getTime(),
      });
    } else {
      setUndoSend(null);
    }

    return queued as OutboxEntry;
  }

  async function undoQueuedSend() {
    if (!window.maildesk || !undoSend) return;
    const item = undoSend.item;
    await window.maildesk.deleteOutbox(item.id);
    setOutbox(await window.maildesk.getOutbox() as OutboxEntry[]);
    const nextCompose: ComposeState = {
      ...EMPTY_COMPOSE,
      from: item.from || defaultIdentityOf(identities, settingsFrom, signature)?.from || settingsFrom,
      to: item.to || "",
      cc: item.cc || "",
      bcc: item.bcc || "",
      subject: item.subject || "",
      text: item.text || "",
      html: item.html || "",
      replyToMessageId: item.replyToMessageId,
      replyReferences: item.replyReferences ?? [],
      attachments: item.attachments ?? [],
    };
    await openComposeWorkspaceTab("draft", nextCompose, Boolean(item.cc || item.bcc));
    setUndoSend(null);
    setError("Envoi annulé. Le message a été rouvert.");
  }

  function openSchedulePicker() {
    setScheduledAt(formatDateTimeLocal(new Date(Date.now() + 60 * 60 * 1000)));
    setScheduleOpen(true);
  }

  async function scheduleCurrentMail() {
    if (!window.maildesk) {
      setError("L’envoi planifié nécessite l’application Electron.");
      return;
    }
    if (!compose.to.trim()) {
      setError("Ajoutez au moins un destinataire avant de planifier l’envoi.");
      return;
    }

    const target = new Date(scheduledAt);
    if (!scheduledAt || !Number.isFinite(target.getTime()) || target.getTime() <= Date.now() + 1000) {
      setError("Choisissez une date et une heure futures.");
      return;
    }

    const payload = {
      ...compose,
      idempotencyKey: `maildesk/${globalThis.crypto.randomUUID()}`,
    };
    await queueMessageForSend(payload, target.toISOString(), false);
    setFolder("outbox");
    setError(`Message programmé pour le ${target.toLocaleString("fr-FR")}.`);
  }

  async function sendMail(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setError("");

    const payload = {
      ...compose,
      idempotencyKey: `maildesk/${globalThis.crypto.randomUUID()}`,
    };

    try {
      if (window.maildesk && undoSendSeconds > 0) {
        const sendAt = new Date(Date.now() + undoSendSeconds * 1000).toISOString();
        await queueMessageForSend(payload, sendAt, true);
        return;
      }

      let response: Response | null = null;
      let responseJson: { error?: string; email?: { id?: string } } = {};

      try {
        response = await fetch("/api/mail/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        responseJson = await response.json().catch(() => ({}));
      } catch (networkError) {
        if (!window.maildesk) throw networkError;
      }

      const shouldQueue = Boolean(
        window.maildesk
        && (!response || response.status === 408 || response.status === 429 || response.status >= 500),
      );

      if (shouldQueue && window.maildesk) {
        await window.maildesk.enqueueOutbox(payload);
        await deleteCurrentDraftRecord();
        setOutbox(await window.maildesk.getOutbox() as OutboxEntry[]);
        finishActiveComposeTab();
        setFolder("outbox");
        setError("Connexion indisponible ou service temporairement inaccessible : message placé dans la boîte d’envoi.");
        return;
      }

      if (!response?.ok) {
        throw new Error(responseJson.error || "Envoi impossible");
      }

      if (window.maildesk && responseJson.email?.id) {
        const addresses = (value: string) => value.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
        await window.maildesk.cacheMailDetail({
          mail: {
            id: responseJson.email.id,
            created_at: new Date().toISOString(),
            from: compose.from || undefined,
            to: addresses(compose.to),
            cc: addresses(compose.cc),
            bcc: addresses(compose.bcc),
            subject: compose.subject || "(Sans objet)",
            html: compose.html || null,
            text: compose.text || null,
            in_reply_to: compose.replyToMessageId,
            references: compose.replyReferences ?? [],
          },
          direction: "outbound",
        });
      }

      if (window.maildesk) {
        await deleteCurrentDraftRecord();
        setOutbox(await window.maildesk.getOutbox() as OutboxEntry[]);
      } else {
        localStorage.removeItem(STORAGE.draft);
      }
      finishActiveComposeTab();
      await refresh();
      setFolder("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Envoi impossible");
    } finally {
      setSending(false);
    }
  }

  function createCustomFolder() {
    if (!window.maildesk) {
      setError("Les dossiers personnalisés sont disponibles dans l’application Windows.");
      return;
    }
    setNewFolderName("");
    setNewFolderOpen(true);
  }

  async function submitCustomFolder() {
    if (!window.maildesk) return;
    const name = newFolderName.trim();
    if (!name) return;
    try {
      const created = await window.maildesk.saveCustomFolder({
        name,
        sortOrder: customFolders.length,
      });
      const folders = await window.maildesk.listCustomFolders() as CustomFolderEntry[];
      setCustomFolders(folders);
      setNewFolderName("");
      setNewFolderOpen(false);
      setFolder(`custom:${created.id}`);
      setSidebarOpen(false);
      void window.maildesk.syncNow();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de créer le dossier.");
    }
  }



  function beginRuleFolderCreate(actionId: string) {
    setRuleFolderCreateActionId(actionId);
    setRuleFolderCreateName("");
  }

  function cancelRuleFolderCreate() {
    setRuleFolderCreateActionId("");
    setRuleFolderCreateName("");
  }

  async function submitRuleFolderCreate(actionId: string) {
    if (!window.maildesk) return;
    const name = ruleFolderCreateName.trim();
    if (!name) return;
    try {
      const created = await window.maildesk.saveCustomFolder({
        name,
        sortOrder: customFolders.length,
      });
      const folders = await window.maildesk.listCustomFolders() as CustomFolderEntry[];
      setCustomFolders(folders);
      updateRuleAction(actionId, { value: created.id });
      setRuleFolderCreateActionId("");
      setRuleFolderCreateName("");
      setSettingsMessage(`Dossier « ${created.name} » créé et sélectionné pour la règle.`);
      void window.maildesk.syncNow();
    } catch (err) {
      setSettingsMessage(err instanceof Error ? err.message : "Impossible de créer le dossier.");
    }
  }

  async function reorderFolder(sourceId: string, targetId: string) {
    if (!window.maildesk || !sourceId || sourceId === targetId) return;
    const sourceIndex = customFolders.findIndex((item) => item.id === sourceId);
    const targetIndex = customFolders.findIndex((item) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const reordered = [...customFolders];
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    setCustomFolders(reordered.map((item, index) => ({ ...item, sortOrder: index })));
    try {
      const saved = await window.maildesk.reorderCustomFolders(reordered.map((item) => item.id));
      setCustomFolders(saved as CustomFolderEntry[]);
      void window.maildesk.syncNow();
    } catch (err) {
      setCustomFolders(await window.maildesk.listCustomFolders() as CustomFolderEntry[]);
      setError(err instanceof Error ? err.message : "Impossible de déplacer le dossier.");
    } finally {
      setDraggedFolderId("");
    }
  }

  async function renameCustomFolder(customFolder: CustomFolderEntry) {
    if (!window.maildesk) return;
    const name = window.prompt("Renommer le dossier", customFolder.name);
    if (!name?.trim() || name.trim() === customFolder.name) return;
    try {
      await window.maildesk.saveCustomFolder({ id: customFolder.id, name: name.trim() });
      setCustomFolders(await window.maildesk.listCustomFolders() as CustomFolderEntry[]);
      void window.maildesk.syncNow();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de renommer le dossier.");
    }
  }

  async function removeCustomFolder(customFolder: CustomFolderEntry) {
    if (!window.maildesk) return;
    if (!window.confirm(`Supprimer le dossier « ${customFolder.name} » ? Les messages seront replacés dans la boîte de réception.`)) return;
    try {
      const result = await window.maildesk.deleteCustomFolder(customFolder.id);
      const [folders, snapshot, currentRules] = await Promise.all([
        window.maildesk.listCustomFolders(),
        window.maildesk.getLocalSnapshot(),
        window.maildesk.listRules(),
      ]);
      setCustomFolders(folders as CustomFolderEntry[]);
      setRules(currentRules as MailRuleEntry[]);
      setInbox(snapshot.messages.filter((mail) => mail.direction !== "outbound") as MailItem[]);
      setSent(snapshot.messages.filter((mail) => mail.direction === "outbound") as MailItem[]);
      if (folder === `custom:${customFolder.id}`) setFolder("inbox");
      setError(`Dossier supprimé. ${result.moved} message${result.moved > 1 ? "s" : ""} replacé${result.moved > 1 ? "s" : ""} dans la boîte de réception.`);
      void window.maildesk.syncNow();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de supprimer le dossier.");
    }
  }

  async function moveMailToCustomFolder(mailId: string, folderId: string) {
    if (!window.maildesk) return;
    const customFolder = customFolders.find((item) => item.id === folderId);
    if (!customFolder) return;
    const updated = await window.maildesk.updateLocalMailState({
      id: mailId,
      patch: { folder: `custom:${folderId}`, isDeleted: false },
    });
    if (!updated) return;
    setInbox((items) => items.map((item) => item.id === mailId ? { ...item, localFolder: `custom:${folderId}` } : item));
    setSent((items) => items.map((item) => item.id === mailId ? { ...item, localFolder: `custom:${folderId}` } : item));
    setArchivedIds((ids) => removeId(ids, mailId));
    setTrashedIds((ids) => removeId(ids, mailId));
    setJunkIds((ids) => removeId(ids, mailId));
    setSnoozedIds((ids) => removeId(ids, mailId));
    setError(`Message déplacé vers « ${customFolder.name} ».`);
    void window.maildesk.syncNow();
  }

  async function openContacts() {
    if (!window.maildesk) {
      setError("Le carnet de contacts local est disponible dans l’application Electron.");
      return;
    }
    setContactSearch("");
    setContactName("");
    setContactEmail("");
    setContactCompany("");
    setContactPhone("");
    setContactNotes("");
    setContactTags("");
    setEditingContactEmail("");
    setContacts(await window.maildesk.listContacts(500) as ContactEntry[]);
    setContactsOpen(true);
    setSidebarOpen(false);
  }

  function composeToContact(contact: ContactEntry) {
    const address = contact.name ? `${contact.name} <${contact.email}>` : contact.email;
    const defaultIdentity = defaultIdentityOf(identities, settingsFrom, signature);
    const composeSignature = defaultIdentity?.signature || signature;
    setCurrentDraftId(globalThis.crypto.randomUUID());
    setCompose({
      ...EMPTY_COMPOSE,
      from: defaultIdentity?.from || settingsFrom,
      to: address,
      text: composeSignature ? `\n\n${signatureToText(composeSignature)}` : "",
      html: signatureToHtml(composeSignature),
      attachments: [],
    });
    setShowCc(false);
    setContactsOpen(false);
    setComposeKind("new");
    setComposeOpen(true);
    setActiveReadingTab("compose");
  }

  function editContactEntry(contact: ContactEntry) {
    setEditingContactEmail(contact.email);
    setContactName(contact.name);
    setContactEmail(contact.email);
    setContactCompany(contact.company);
    setContactPhone(contact.phone);
    setContactNotes(contact.notes);
    setContactTags(contact.tags.join(", "));
  }

  function resetContactEditor() {
    setEditingContactEmail("");
    setContactName("");
    setContactEmail("");
    setContactCompany("");
    setContactPhone("");
    setContactNotes("");
    setContactTags("");
  }

  async function saveContactEntry() {
    if (!window.maildesk || !contactEmail.trim()) return;
    try {
      const existing = contacts.find((item) => item.email === editingContactEmail || item.email === contactEmail.trim().toLowerCase());
      await window.maildesk.saveContact({
        email: contactEmail,
        name: contactName,
        company: contactCompany,
        phone: contactPhone,
        notes: contactNotes,
        tags: contactTags.split(",").map((item) => item.trim()).filter(Boolean),
        isFavorite: existing?.isFavorite ?? false,
      });
      if (editingContactEmail && editingContactEmail !== contactEmail.trim().toLowerCase()) {
        await window.maildesk.deleteContact(editingContactEmail);
      }
      setContacts(await window.maildesk.listContacts(500) as ContactEntry[]);
      resetContactEditor();
      void window.maildesk.syncNow();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d’enregistrer le contact.");
    }
  }

  async function toggleContactFavorite(contact: ContactEntry) {
    if (!window.maildesk) return;
    await window.maildesk.saveContact({
      email: contact.email,
      name: contact.name,
      company: contact.company,
      phone: contact.phone,
      notes: contact.notes,
      tags: contact.tags,
      isFavorite: !contact.isFavorite,
    });
    setContacts(await window.maildesk.listContacts(500) as ContactEntry[]);
    void window.maildesk.syncNow();
  }

  async function deleteContactEntry(email: string) {
    if (!window.maildesk) return;
    if (!window.confirm(`Supprimer ${email} du carnet de contacts ?`)) return;
    await window.maildesk.deleteContact(email);
    setContacts(await window.maildesk.listContacts(500) as ContactEntry[]);
    void window.maildesk.syncNow();
  }

  function resetRuleBuilder() {
    setRuleName("");
    setRuleConditions([{ id: globalThis.crypto.randomUUID(), field: "from", operator: "contains", value: "" }]);
    setRuleActions([{ id: globalThis.crypto.randomUUID(), type: "archive", value: "" }]);
    setRuleMatchMode("all");
    setRulePriority(100);
    setRuleStopProcessing(false);
    setRuleTestResult(null);
    setRuleFolderCreateActionId("");
    setRuleFolderCreateName("");
  }

  function addRuleCondition() {
    setRuleConditions((current) => [
      ...current,
      { id: globalThis.crypto.randomUUID(), field: "subject", operator: "contains", value: "" },
    ]);
    setRuleTestResult(null);
  }

  function updateRuleCondition(id: string, patch: Partial<MailRuleConditionEntry>) {
    setRuleConditions((current) => current.map((condition) => condition.id === id ? { ...condition, ...patch } : condition));
    setRuleTestResult(null);
  }

  function removeRuleCondition(id: string) {
    setRuleConditions((current) => current.length > 1 ? current.filter((condition) => condition.id !== id) : current);
    setRuleTestResult(null);
  }

  function addRuleAction() {
    setRuleActions((current) => [...current, { id: globalThis.crypto.randomUUID(), type: "archive", value: "" }]);
    setRuleTestResult(null);
  }

  function updateRuleAction(id: string, patch: Partial<MailRuleActionEntry>) {
    setRuleActions((current) => current.map((action) => action.id === id ? { ...action, ...patch } : action));
    setRuleTestResult(null);
  }

  function removeRuleAction(id: string) {
    setRuleActions((current) => current.length > 1 ? current.filter((action) => action.id !== id) : current);
    setRuleTestResult(null);
  }

  function validateRuleDraft() {
    if (ruleConditions.some((condition) => !condition.value.trim())) {
      return "Complétez toutes les conditions.";
    }
    const invalidTarget = ruleActions.some((action) =>
      (action.type === "move_to_folder" || action.type === "webhook") && !String(action.value || "").trim());
    if (invalidTarget) return "Complétez la cible de chaque action.";
    if (ruleActions.filter((action) => action.type === "webhook").length > 1) return "Une règle ne peut contenir qu’un seul webhook.";
    for (const action of ruleActions) {
      if (action.type !== "webhook") continue;
      try {
        const url = new URL(String(action.value || "").trim());
        if (!["http:", "https:"].includes(url.protocol)) return "Chaque webhook doit utiliser une URL HTTP ou HTTPS valide.";
      } catch {
        return "Chaque webhook doit utiliser une URL HTTP ou HTTPS valide.";
      }
    }
    return "";
  }

  async function testRuleDraft() {
    if (!window.maildesk) return;
    const validation = validateRuleDraft();
    if (validation) {
      setSettingsMessage(validation);
      return;
    }
    try {
      const result = await window.maildesk.testRule({
        conditions: ruleConditions,
        actions: ruleActions,
        matchMode: ruleMatchMode,
        priority: rulePriority,
        stopProcessing: ruleStopProcessing,
      });
      setRuleTestResult(result);
      setSettingsMessage(result.matched
        ? `Test : ${result.matched} message${result.matched > 1 ? "s" : ""} correspond${result.matched > 1 ? "ent" : ""}.`
        : "Test : aucun message existant ne correspond.");
    } catch (err) {
      setSettingsMessage(err instanceof Error ? err.message : "Impossible de tester la règle.");
    }
  }

  async function addRule() {
    const validation = validateRuleDraft();
    if (!window.maildesk || validation) {
      setSettingsMessage(validation || "MailDesk Electron est requis.");
      return false;
    }

    try {
      await window.maildesk.saveRule({
        name: ruleName,
        conditions: ruleConditions,
        actions: ruleActions,
        matchMode: ruleMatchMode,
        priority: rulePriority,
        stopProcessing: ruleStopProcessing,
        enabled: true,
      });
      setRules(await window.maildesk.listRules() as MailRuleEntry[]);
      setRuleRuns(await window.maildesk.listRuleRuns("", 50) as MailRuleRunEntry[]);
      resetRuleBuilder();
      setSettingsMessage("Règle V2 enregistrée.");
      void window.maildesk.syncNow();
      return true;
    } catch (err) {
      setSettingsMessage(err instanceof Error ? err.message : "Impossible de créer la règle.");
      return false;
    }
  }

  function selectTemplateForEditing(template: MailTemplateEntry) {
    setTemplateId(template.id);
    setTemplateName(template.name);
    setTemplateSubject(template.subject);
    setTemplateHtml(template.html);
    setTemplateText(template.text);
    setTemplateShortcut(template.shortcut);
    setSettingsBaselines((current) => ({
      ...current,
      templates: JSON.stringify({
        id: template.id,
        name: template.name,
        subject: template.subject,
        html: template.html,
        text: template.text,
        shortcut: template.shortcut,
      }),
    }));
  }

  function resetTemplateEditor() {
    setTemplateId("");
    setTemplateName("");
    setTemplateSubject("");
    setTemplateHtml("");
    setTemplateText("");
    setTemplateShortcut("");
    setSettingsBaselines((current) => ({
      ...current,
      templates: JSON.stringify({ id: "", name: "", subject: "", html: "", text: "", shortcut: "" }),
    }));
  }

  async function saveTemplateEditor() {
    if (!window.maildesk) return;
    if (!templateName.trim()) {
      setSettingsMessage("Donnez un nom au modèle avant de l’enregistrer.");
      return;
    }
    try {
      const saved = await window.maildesk.saveTemplate({
        id: templateId || undefined,
        name: templateName,
        subject: templateSubject,
        html: templateHtml,
        text: templateText,
        shortcut: templateShortcut,
      }) as MailTemplateEntry;
      setTemplates(await window.maildesk.listTemplates() as MailTemplateEntry[]);
      selectTemplateForEditing(saved);
      setSettingsMessage("Modèle enregistré.");
      void window.maildesk.syncNow();
    } catch (err) {
      setSettingsMessage(err instanceof Error ? err.message : "Impossible d’enregistrer le modèle.");
    }
  }

  async function deleteTemplateEntry(id: string) {
    if (!window.maildesk) return;
    await window.maildesk.deleteTemplate(id);
    setTemplates(await window.maildesk.listTemplates() as MailTemplateEntry[]);
    if (templateId === id) resetTemplateEditor();
    void window.maildesk.syncNow();
  }

  function applyTemplate(template: MailTemplateEntry) {
    setCompose((current) => ({
      ...current,
      subject: current.subject || template.subject,
      html: template.html ? `${template.html}${current.html ? `<p><br></p>${current.html}` : ""}` : current.html,
      text: template.text ? `${template.text}${current.text ? `\\n\\n${current.text}` : ""}` : current.text,
    }));
  }

  function localDateTimeValue(value: Date) {
    const offset = value.getTimezoneOffset() * 60_000;
    return new Date(value.getTime() - offset).toISOString().slice(0, 16);
  }

  function resetCalendarEditor() {
    const start = new Date(Date.now() + 60 * 60 * 1000);
    start.setMinutes(0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    setEditingCalendarId("");
    setCalendarTitle("");
    setCalendarDescription("");
    setCalendarLocation("");
    setCalendarStart(localDateTimeValue(start));
    setCalendarEnd(localDateTimeValue(end));
    setCalendarAttendees("");
    setCalendarAllDay(false);
  }

  async function openCalendar() {
    if (!window.maildesk) {
      setError("Le calendrier local est disponible dans l’application Electron.");
      return;
    }
    setCalendarEvents(await window.maildesk.listCalendarEvents() as CalendarEventEntry[]);
    resetCalendarEditor();
    setCalendarOpen(true);
    setSidebarOpen(false);
  }

  function editCalendarEvent(event: CalendarEventEntry) {
    setEditingCalendarId(event.id);
    setCalendarTitle(event.title);
    setCalendarDescription(event.description);
    setCalendarLocation(event.location);
    setCalendarStart(localDateTimeValue(new Date(event.startAt)));
    setCalendarEnd(localDateTimeValue(new Date(event.endAt)));
    setCalendarAttendees(event.attendees.join(", "));
    setCalendarAllDay(event.allDay);
  }

  async function saveCalendarEntry() {
    if (!window.maildesk || !calendarTitle.trim() || !calendarStart || !calendarEnd) return;
    try {
      await window.maildesk.saveCalendarEvent({
        id: editingCalendarId || undefined,
        title: calendarTitle,
        description: calendarDescription,
        location: calendarLocation,
        startAt: new Date(calendarStart).toISOString(),
        endAt: new Date(calendarEnd).toISOString(),
        allDay: calendarAllDay,
        attendees: calendarAttendees.split(/[;,]/).map((item) => item.trim()).filter(Boolean),
      });
      setCalendarEvents(await window.maildesk.listCalendarEvents() as CalendarEventEntry[]);
      resetCalendarEditor();
      void window.maildesk.syncNow();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d’enregistrer l’événement.");
    }
  }

  async function deleteCalendarEntry(id: string) {
    if (!window.maildesk) return;
    await window.maildesk.deleteCalendarEvent(id);
    setCalendarEvents(await window.maildesk.listCalendarEvents() as CalendarEventEntry[]);
    if (editingCalendarId === id) resetCalendarEditor();
    void window.maildesk.syncNow();
  }

  async function importCalendarIcs() {
    if (!window.maildesk) return;
    const result = await window.maildesk.importCalendarIcs();
    if (result.ok) {
      setCalendarEvents(await window.maildesk.listCalendarEvents() as CalendarEventEntry[]);
      setError(`${result.imported || 0} événement${(result.imported || 0) > 1 ? "s" : ""} importé${(result.imported || 0) > 1 ? "s" : ""}.`);
      void window.maildesk.syncNow();
    }
  }

  async function exportCalendarIcs() {
    if (!window.maildesk) return;
    const result = await window.maildesk.exportCalendarIcs();
    if (result.ok && result.path) setError(`Calendrier exporté : ${result.path}`);
  }

  async function toggleRule(rule: MailRuleEntry) {
    if (!window.maildesk) return;
    await window.maildesk.saveRule({
      id: rule.id,
      name: rule.name,
      conditions: rule.conditions,
      actions: rule.actions,
      matchMode: rule.matchMode,
      priority: rule.priority,
      stopProcessing: rule.stopProcessing,
      enabled: !rule.enabled,
    });
    setRules(await window.maildesk.listRules() as MailRuleEntry[]);
    void window.maildesk.syncNow();
  }

  async function deleteRuleEntry(id: string) {
    if (!window.maildesk) return;
    await window.maildesk.deleteRule(id);
    setRules(await window.maildesk.listRules() as MailRuleEntry[]);
    setRuleRuns(await window.maildesk.listRuleRuns("", 50) as MailRuleRunEntry[]);
    void window.maildesk.syncNow();
  }

  async function runRulesNow() {
    if (!window.maildesk) return;
    const result = await window.maildesk.runRules();
    setInbox(result.snapshot.messages.filter((mail) => mail.direction !== "outbound") as MailItem[]);
    setSent(result.snapshot.messages.filter((mail) => mail.direction === "outbound") as MailItem[]);
    setReadIds(result.snapshot.readIds);
    setStarredIds(result.snapshot.starredIds);
    setArchivedIds(result.snapshot.archivedIds);
    setTrashedIds(result.snapshot.trashedIds);
    setJunkIds(result.snapshot.junkIds ?? []);
    setSnoozedIds(result.snapshot.snoozedIds ?? []);
    setDeletedIds(result.snapshot.deletedIds);
    setRuleRuns(await window.maildesk.listRuleRuns("", 50) as MailRuleRunEntry[]);
    setSettingsMessage(`${result.matched} message${result.matched > 1 ? "s" : ""} traité${result.matched > 1 ? "s" : ""} par les règles.`);
    void window.maildesk.syncNow();
  }

  function materializedSettingsIdentities() {
    const base = settingsIdentities.length
      ? settingsIdentities
      : [{ id: "default", name: "Principal", from: settingsFrom, signature: settingsSignature, isDefault: true }];

    return base.map((identity) => identity.isDefault
      ? { ...identity, from: settingsFrom.trim(), signature: settingsSignature }
      : identity);
  }

  function addIdentitySetting() {
    setSettingsIdentities((current) => {
      const base = current.length
        ? current
        : [{ id: "default", name: "Principal", from: settingsFrom, signature: settingsSignature, isDefault: true }];
      return [
        ...base,
        {
          id: globalThis.crypto.randomUUID(),
          name: "Nouvelle identité",
          from: "",
          signature: "",
          isDefault: false,
        },
      ];
    });
  }

  function updateIdentitySetting(id: string, patch: Partial<MailIdentity>) {
    setSettingsIdentities((current) => current.map((identity) => identity.id === id ? { ...identity, ...patch } : identity));
  }

  function makeIdentityDefault(id: string) {
    const materialized = materializedSettingsIdentities();
    const nextDefault = materialized.find((identity) => identity.id === id);
    if (!nextDefault) return;
    setSettingsIdentities(materialized.map((identity) => ({ ...identity, isDefault: identity.id === id })));
    setSettingsFrom(nextDefault.from);
    setSettingsSignature(nextDefault.signature);
  }

  function deleteIdentitySetting(id: string) {
    setSettingsIdentities((current) => current.filter((identity) => identity.id !== id || identity.isDefault));
  }

  function changeComposeIdentity(nextFrom: string) {
    const previousSignature = signatureForSender(identities, compose.from, signature);
    const nextSignature = signatureForSender(identities, nextFrom, signature);
    const previousHtml = signatureToHtml(previousSignature);
    const nextHtml = signatureToHtml(nextSignature);
    const previousText = signatureToText(previousSignature);
    const nextText = signatureToText(nextSignature);

    setCompose((current) => {
      let text = current.text;
      let html = current.html;

      if (!text.trim() || text.trim() === previousText.trim()) {
        text = nextText ? `\n\n${nextText}` : "";
      } else if (previousText && text.includes(previousText)) {
        text = text.replace(previousText, nextText);
      }

      if (!html.trim() || html === previousHtml) {
        html = nextHtml;
      } else if (previousHtml && html.startsWith(previousHtml)) {
        html = `${nextHtml}${html.slice(previousHtml.length)}`;
      }

      return { ...current, from: nextFrom, text, html };
    });
  }

  async function exportLocalBackup() {
    if (!window.maildesk) return;
    setSettingsMessage("Création de la sauvegarde...");
    try {
      const result = await window.maildesk.exportBackup();
      if (result.canceled) {
        setSettingsMessage("Export annulé.");
        return;
      }
      setSettingsMessage(result.ok && result.path
        ? `Sauvegarde créée : ${result.path}`
        : "Impossible de créer la sauvegarde.");
    } catch (err) {
      setSettingsMessage(err instanceof Error ? err.message : "Impossible de créer la sauvegarde.");
    }
  }

  async function restoreLocalBackup() {
    if (!window.maildesk) return;
    setSettingsMessage("Restauration de la sauvegarde...");
    try {
      const result = await window.maildesk.restoreBackup();
      if (result.canceled) {
        setSettingsMessage("Restauration annulée.");
        return;
      }
      if (!result.ok || !result.snapshot) {
        setSettingsMessage("Impossible de restaurer la sauvegarde.");
        return;
      }

      const snapshot = result.snapshot;
      const [restoredDrafts, restoredOutbox, restoredContacts, restoredFolders, restoredRules, restoredTemplates, restoredCalendar, restoredBlocked] = await Promise.all([
        window.maildesk.listDrafts(),
        window.maildesk.getOutbox(),
        window.maildesk.listContacts(500),
        window.maildesk.listCustomFolders(),
        window.maildesk.listRules(),
        window.maildesk.listTemplates(),
        window.maildesk.listCalendarEvents(),
        window.maildesk.listBlockedSenders(),
      ]);

      setInbox(snapshot.messages.filter((mail) => mail.direction !== "outbound") as MailItem[]);
      setSent(snapshot.messages.filter((mail) => mail.direction === "outbound") as MailItem[]);
      setReadIds(snapshot.readIds);
      setStarredIds(snapshot.starredIds);
            setFlaggedIds(snapshot.flaggedIds ?? []);
            setPinnedIds(snapshot.pinnedIds ?? []);
      setArchivedIds(snapshot.archivedIds);
      setTrashedIds(snapshot.trashedIds);
      setJunkIds(snapshot.junkIds ?? []);
      setSnoozedIds(snapshot.snoozedIds ?? []);
      setDeletedIds(snapshot.deletedIds);
      setDrafts(restoredDrafts as DraftEntry[]);
      setOutbox(restoredOutbox as OutboxEntry[]);
      setContacts(restoredContacts as ContactEntry[]);
      setCustomFolders(restoredFolders as CustomFolderEntry[]);
      setRules(restoredRules as MailRuleEntry[]);
      setTemplates(restoredTemplates as MailTemplateEntry[]);
      setCalendarEvents(restoredCalendar as CalendarEventEntry[]);
      setBlockedSenders(restoredBlocked);
      setSelected(null);
      setDetail(null);
      setThreadDetails({});
      setExpandedThreadIds([]);
      setDatabasePath(result.databasePath || databasePath);
      setSettingsMessage(result.safetyCopy
        ? `Sauvegarde restaurée. Copie de sécurité précédente : ${result.safetyCopy}`
        : "Sauvegarde restaurée.");
    } catch (err) {
      setSettingsMessage(err instanceof Error ? err.message : "Impossible de restaurer la sauvegarde.");
    }
  }

  async function openLocalDataFolder() {
    if (!window.maildesk) return;
    const result = await window.maildesk.openDataFolder();
    setSettingsMessage(result.ok
      ? `Dossier de données ouvert : ${result.path}`
      : (result.error || "Impossible d’ouvrir le dossier de données."));
  }

  function closeSettings() {
    setSettingsThemeColor(themeColor);
    setSettingsOpen(false);
  }

  async function openSettings() {
    setSettingsMessage("");
    setUpdateStatusMessage("");
    setSettingsApiKey("");
    setSettingsSupabaseKey("");
    setSettingsSupabaseManagementToken("");
    setSettingsTab("account");
    resetRuleBuilder();
    resetTemplateEditor();

    if (window.maildesk) {
      try {
        const [current, currentRules, currentRuleRuns, currentTemplates, currentBlockedSenders, windowsIntegration, appInfo, mobileStatus] = await Promise.all([
          window.maildesk.getSettings(),
          window.maildesk.listRules(),
          window.maildesk.listRuleRuns("", 50),
          window.maildesk.listTemplates(),
          window.maildesk.listBlockedSenders(),
          window.maildesk.getWindowsIntegration(),
          window.maildesk.getAppInfo(),
          window.maildesk.getMobileProvisioningStatus(),
        ]);
        setRules(currentRules as MailRuleEntry[]);
        setRuleRuns(currentRuleRuns as MailRuleRunEntry[]);
        setTemplates(currentTemplates as MailTemplateEntry[]);
        setBlockedSenders(currentBlockedSenders);
        setMobileProvisioningConfigured(Boolean(mobileStatus.configured));
        setMobileProvisioningReason(mobileStatus.reason || "QR mobile prêt.");

        const currentIdentities = current.identities?.length
          ? current.identities
          : [{ id: "default", name: "Principal", from: current.from, signature: current.signature || "", isDefault: true }];
        const defaultIdentity = defaultIdentityOf(currentIdentities, current.from, current.signature || "");
        const loadedFrom = defaultIdentity?.from || current.from;
        const loadedSignature = defaultIdentity?.signature || current.signature || "";
        const loadedUndo = Number(current.undoSendSeconds ?? 10);
        const loadedRefresh = Math.max(5, Math.min(3600, Number(current.refreshIntervalSeconds ?? 60)));
        const loadedTheme = normalizeThemeColor(current.themeColor || "#0f6cbd");
        const loadedSupabaseUrl = current.supabaseUrl || "";
        const loadedProjectRef = current.supabaseProjectRef || "";
        const loadedUpdateEnabled = Boolean(current.autoUpdateEnabled);
        const loadedManifestUrl = current.updateManifestUrl || "";

        setSettingsIdentities(currentIdentities);
        setSettingsFrom(loadedFrom);
        setSettingsHasApiKey(current.hasApiKey);
        setSettingsSignature(loadedSignature);
        setSettingsSupabaseUrl(loadedSupabaseUrl);
        setSettingsSupabaseProjectRef(loadedProjectRef);
        setMobileProvisioningQr("");
        setMobileProvisioningProjectRef("");
        setSettingsHasSupabaseKey(current.hasSupabaseKey);
        setSettingsHasSupabaseManagementToken(current.hasSupabaseManagementToken);
        setSettingsUndoSendSeconds(loadedUndo);
        setSettingsRefreshIntervalSeconds(loadedRefresh);
        setThemeColor(loadedTheme);
        setSettingsThemeColor(loadedTheme);
        setSettingsAutoUpdateEnabled(loadedUpdateEnabled);
        setSettingsUpdateManifestUrl(loadedManifestUrl);
        setSettingsStartWithWindows(windowsIntegration.openAtLogin);
        setSettingsMailtoRegistered(windowsIntegration.mailtoRegistered);
        setSettingsIsPackaged(windowsIntegration.isPackaged);
        setSettingsAppVersion(appInfo.version || "");
        setSettingsUserDataPath(appInfo.userDataPath || "");
        setDatabasePath(current.databasePath || appInfo.databasePath || "");

        setSettingsBaselines({
          account: JSON.stringify({
            from: loadedFrom.trim(),
            signature: loadedSignature,
            identities: currentIdentities,
            apiKeyChanged: false,
          }),
          sending: JSON.stringify({ undoSendSeconds: loadedUndo }),
          refresh: JSON.stringify({ refreshIntervalSeconds: loadedRefresh }),
          appearance: JSON.stringify({ themeColor: loadedTheme }),
          rules: JSON.stringify({
            name: "",
            conditions: [{ field: "from", operator: "contains", value: "" }],
            actions: [{ type: "archive", value: "" }],
            matchMode: "all",
            priority: 100,
            stopProcessing: false,
          }),
          templates: JSON.stringify({ id: "", name: "", subject: "", html: "", text: "", shortcut: "" }),
          windows: JSON.stringify({
            startWithWindows: windowsIntegration.openAtLogin,
            mailtoRegistered: windowsIntegration.mailtoRegistered,
          }),
          supabase: JSON.stringify({
            url: loadedSupabaseUrl.trim(),
            projectRef: loadedProjectRef.trim(),
            keyChanged: false,
            managementTokenChanged: false,
          }),
          updates: JSON.stringify({
            enabled: loadedUpdateEnabled,
            manifestUrl: loadedManifestUrl.trim(),
          }),
        });
      } catch (err) {
        setSettingsMessage(err instanceof Error ? err.message : "Impossible de lire les paramètres Electron");
      }
    }
    setSettingsOpen(true);
  }

  async function syncNowFromSettings() {
    if (!window.maildesk) return;
    setSettingsMessage("Synchronisation en cours...");
    const result = await window.maildesk.syncNow();
    setSettingsMessage(result.message);
    if (result.ok) {
      const snapshot = await window.maildesk.getLocalSnapshot();
      setInbox(snapshot.messages.filter((mail) => mail.direction !== "outbound") as MailItem[]);
      setSent(snapshot.messages.filter((mail) => mail.direction === "outbound") as MailItem[]);
      setReadIds(snapshot.readIds);
      setStarredIds(snapshot.starredIds);
            setFlaggedIds(snapshot.flaggedIds ?? []);
            setPinnedIds(snapshot.pinnedIds ?? []);
      setArchivedIds(snapshot.archivedIds);
      setTrashedIds(snapshot.trashedIds);
            setJunkIds(snapshot.junkIds ?? []);
            setSnoozedIds(snapshot.snoozedIds ?? []);
      setDeletedIds(snapshot.deletedIds);
    }
  }

  async function refreshMobileProvisioningStatus() {
    if (!window.maildesk) {
      setMobileProvisioningConfigured(false);
      setMobileProvisioningReason("MailDesk Desktop est requis.");
      return false;
    }

    try {
      const status = await window.maildesk.getMobileProvisioningStatus();
      setMobileProvisioningConfigured(Boolean(status.configured));
      setMobileProvisioningReason(status.reason || "QR mobile prêt.");
      return Boolean(status.configured);
    } catch (err) {
      setMobileProvisioningConfigured(false);
      setMobileProvisioningReason(err instanceof Error ? err.message : "Configuration mobile indisponible.");
      return false;
    }
  }

  async function openMobileProvisioningQrFromFooter() {
    if (!window.maildesk || !mobileProvisioningConfigured) return;
    setGeneratingMobileQr(true);
    setMobileQrDialogError("");
    setMobileQrDialogOpen(true);
    try {
      const result = await window.maildesk.getMobileProvisioning();
      setMobileProvisioningQr(result.encoded);
      setMobileProvisioningProjectRef(result.projectRef || "");
    } catch (err) {
      setMobileProvisioningQr("");
      setMobileQrDialogError(err instanceof Error ? err.message : "Impossible de générer le QR mobile.");
      await refreshMobileProvisioningStatus();
    } finally {
      setGeneratingMobileQr(false);
    }
  }

  async function deployMobileEdgeFromSettings() {
    if (!window.maildesk) return;
    if (settingsSnapshots.supabase !== settingsBaselines.supabase) {
      setEdgeDeployMessage("Enregistrez d’abord la configuration Supabase avec la disquette.");
      return;
    }

    setDeployingMobileEdge(true);
    setEdgeDeployMessage("Déploiement de l’Edge Function MailDesk...");
    try {
      const result = await window.maildesk.deployMobileEdgeFunction();
      setEdgeDeployMessage(`${result.message} URL : ${result.apiUrl}`);
      await refreshMobileProvisioningStatus();
    } catch (err) {
      setEdgeDeployMessage(err instanceof Error ? err.message : "Impossible de déployer l’Edge Function MailDesk.");
    } finally {
      setDeployingMobileEdge(false);
    }
  }

  async function generateMobileProvisioningQr() {
    if (!window.maildesk) return;
    if (settingsSnapshots.supabase !== settingsBaselines.supabase) {
      setSettingsMessage("Enregistrez d’abord la configuration Supabase avant de générer le QR mobile.");
      return;
    }

    setGeneratingMobileQr(true);
    setMobileProvisioningQr("");
    setSettingsMessage("Génération du QR mobile...");
    try {
      const result = await window.maildesk.getMobileProvisioning();
      setMobileProvisioningQr(result.encoded);
      setMobileProvisioningProjectRef(result.projectRef || settingsSupabaseProjectRef);
      setMobileProvisioningConfigured(true);
      setMobileProvisioningReason("QR mobile prêt.");
      setSettingsMessage("QR mobile prêt. Scannez-le depuis MailDesk Mobile.");
    } catch (err) {
      setSettingsMessage(err instanceof Error ? err.message : "Impossible de générer le QR mobile.");
    } finally {
      setGeneratingMobileQr(false);
    }
  }

  async function initializeSupabaseFromSettings() {
    if (!window.maildesk) return;
    setInitializingSupabase(true);
    setSettingsMessage("Initialisation Supabase en cours...");
    try {
      const result = await window.maildesk.initializeSupabase({
        from: settingsFrom,
        apiKey: settingsApiKey || undefined,
        signature: settingsSignature,
        identities: materializedSettingsIdentities(),
        undoSendSeconds: settingsUndoSendSeconds,
        supabaseUrl: settingsSupabaseUrl,
        supabaseKey: settingsSupabaseKey || undefined,
        supabaseProjectRef: settingsSupabaseProjectRef,
        supabaseManagementToken: settingsSupabaseManagementToken || undefined,
      });
      setSettingsHasSupabaseKey(result.hasSupabaseKey);
      setSettingsHasSupabaseManagementToken(result.hasSupabaseManagementToken);
      if (result.supabaseProjectRef) setSettingsSupabaseProjectRef(result.supabaseProjectRef);
      if (!result.ok) {
        setSettingsMessage(result.message || "Initialisation Supabase impossible.");
        return;
      }

      setSettingsSupabaseKey("");
      setSettingsSupabaseManagementToken("");
      const savedProjectRef = result.supabaseProjectRef || settingsSupabaseProjectRef;
      setSettingsBaselines((current) => ({
        ...current,
        supabase: JSON.stringify({
          url: settingsSupabaseUrl.trim(),
          projectRef: savedProjectRef.trim(),
          keyChanged: false,
          managementTokenChanged: false,
        }),
      }));
      setSettingsMessage(result.message);
      await refreshMobileProvisioningStatus();

      const snapshot = await window.maildesk.getLocalSnapshot();
      setInbox(snapshot.messages.filter((mail) => mail.direction !== "outbound") as MailItem[]);
      setSent(snapshot.messages.filter((mail) => mail.direction === "outbound") as MailItem[]);
      setReadIds(snapshot.readIds);
      setStarredIds(snapshot.starredIds);
            setFlaggedIds(snapshot.flaggedIds ?? []);
            setPinnedIds(snapshot.pinnedIds ?? []);
      setArchivedIds(snapshot.archivedIds);
      setTrashedIds(snapshot.trashedIds);
            setJunkIds(snapshot.junkIds ?? []);
            setSnoozedIds(snapshot.snoozedIds ?? []);
      setDeletedIds(snapshot.deletedIds);
    } catch (err) {
      setSettingsMessage(err instanceof Error ? err.message : "Initialisation Supabase impossible.");
    } finally {
      setInitializingSupabase(false);
    }
  }

  async function checkUpdatesNow() {
    if (!window.maildesk) return;
    setCheckingUpdates(true);
    setUpdateStatusMessage("Recherche d’une mise à jour...");
    try {
      const result = await window.maildesk.checkForUpdates();
      setUpdateReady(Boolean(result.available && result.downloaded));
      setUpdateStatusMessage(result.available
        ? `${result.message}${result.downloaded ? " Téléchargement vérifié et prêt à installer." : ""}${result.notes ? ` — ${result.notes}` : ""}`
        : result.message);
    } catch (err) {
      setUpdateReady(false);
      setUpdateStatusMessage(err instanceof Error ? err.message : "Recherche de mise à jour impossible.");
    } finally {
      setCheckingUpdates(false);
    }
  }

  async function installReadyUpdate() {
    if (!window.maildesk) return;
    const result = await window.maildesk.installPendingUpdate();
    if (!result.ok) setUpdateStatusMessage(result.message || "Aucune mise à jour prête.");
  }

  async function saveActiveSettingsTab() {
    if (!window.maildesk || settingsTab === "data" || !activeSettingsDirty) return;
    setSavingSettings(true);
    setSettingsMessage("");

    try {
      if (settingsTab === "rules") {
        const saved = await addRule();
        if (saved) {
          setSettingsBaselines((current) => ({
            ...current,
            rules: JSON.stringify({
              name: "",
              conditions: [{ field: "from", operator: "contains", value: "" }],
              actions: [{ type: "archive", value: "" }],
              matchMode: "all",
              priority: 100,
              stopProcessing: false,
            }),
          }));
        }
        return;
      }

      if (settingsTab === "templates") {
        await saveTemplateEditor();
        return;
      }

      if (settingsTab === "windows") {
        const startup = await window.maildesk.setWindowsStartup(settingsStartWithWindows);
        const mailto = await window.maildesk.setMailtoHandler(settingsMailtoRegistered);
        setSettingsStartWithWindows(startup.openAtLogin);
        setSettingsMailtoRegistered(mailto.mailtoRegistered);
        const baseline = JSON.stringify({
          startWithWindows: startup.openAtLogin,
          mailtoRegistered: mailto.mailtoRegistered,
        });
        setSettingsBaselines((current) => ({ ...current, windows: baseline }));
        setSettingsMessage("Intégration Windows enregistrée.");
        return;
      }

      if (settingsTab === "account") {
        const result = await window.maildesk.saveSettings({
          from: settingsFrom,
          apiKey: settingsApiKey || undefined,
          signature: settingsSignature,
          identities: materializedSettingsIdentities(),
        });
        const savedIdentities = result.identities ?? materializedSettingsIdentities();
        const savedDefault = defaultIdentityOf(savedIdentities, result.from, result.signature || "");
        const savedFrom = savedDefault?.from || result.from;
        const savedSignature = savedDefault?.signature || result.signature || "";
        setSettingsHasApiKey(result.hasApiKey);
        setIdentities(savedIdentities);
        setSettingsIdentities(savedIdentities);
        setSettingsFrom(savedFrom);
        setSettingsSignature(savedSignature);
        setSignature(savedSignature);
        setSettingsApiKey("");
        setSettingsBaselines((current) => ({
          ...current,
          account: JSON.stringify({
            from: savedFrom.trim(),
            signature: savedSignature,
            identities: savedIdentities,
            apiKeyChanged: false,
          }),
        }));
        setSettingsMessage("Compte et identités enregistrés.");
        return;
      }

      if (settingsTab === "sending") {
        const result = await window.maildesk.saveSettings({ undoSendSeconds: settingsUndoSendSeconds });
        const savedUndo = Number(result.undoSendSeconds ?? settingsUndoSendSeconds);
        setUndoSendSeconds(savedUndo);
        setSettingsUndoSendSeconds(savedUndo);
        setSettingsBaselines((current) => ({
          ...current,
          sending: JSON.stringify({ undoSendSeconds: savedUndo }),
        }));
        setSettingsMessage("Préférences d’envoi enregistrées.");
        return;
      }

      if (settingsTab === "refresh") {
        const result = await window.maildesk.saveSettings({ refreshIntervalSeconds: settingsRefreshIntervalSeconds });
        const savedRefresh = Math.max(5, Math.min(3600, Number(result.refreshIntervalSeconds ?? settingsRefreshIntervalSeconds)));
        setRefreshIntervalSeconds(savedRefresh);
        setSettingsRefreshIntervalSeconds(savedRefresh);
        setSettingsBaselines((current) => ({
          ...current,
          refresh: JSON.stringify({ refreshIntervalSeconds: savedRefresh }),
        }));
        setSettingsMessage(`Actualisation automatique réglée sur ${refreshIntervalLabel(savedRefresh)}.`);
        return;
      }

      if (settingsTab === "appearance") {
        const result = await window.maildesk.saveSettings({ themeColor: normalizeThemeColor(settingsThemeColor) });
        const savedTheme = normalizeThemeColor(result.themeColor || settingsThemeColor);
        setThemeColor(savedTheme);
        setSettingsThemeColor(savedTheme);
        setSettingsBaselines((current) => ({
          ...current,
          appearance: JSON.stringify({ themeColor: savedTheme }),
        }));
        setSettingsMessage("Thème couleur enregistré.");
        return;
      }

      if (settingsTab === "supabase") {
        const result = await window.maildesk.saveSettings({
          supabaseUrl: settingsSupabaseUrl,
          supabaseKey: settingsSupabaseKey || undefined,
          supabaseProjectRef: settingsSupabaseProjectRef,
          supabaseManagementToken: settingsSupabaseManagementToken || undefined,
        });
        const savedRef = result.supabaseProjectRef || settingsSupabaseProjectRef;
        setSettingsHasSupabaseKey(result.hasSupabaseKey);
        setSettingsHasSupabaseManagementToken(result.hasSupabaseManagementToken);
        setSettingsSupabaseProjectRef(savedRef);
        setSettingsSupabaseKey("");
        setSettingsSupabaseManagementToken("");
        setSettingsBaselines((current) => ({
          ...current,
          supabase: JSON.stringify({
            url: settingsSupabaseUrl.trim(),
            projectRef: savedRef.trim(),
            keyChanged: false,
            managementTokenChanged: false,
          }),
        }));
        setSettingsMessage(result.sync?.message || "Synchronisation Supabase enregistrée.");
        await refreshMobileProvisioningStatus();
        return;
      }

      if (settingsTab === "updates") {
        const result = await window.maildesk.saveSettings({
          autoUpdateEnabled: settingsAutoUpdateEnabled,
          updateManifestUrl: settingsUpdateManifestUrl,
        });
        const enabled = Boolean(result.autoUpdateEnabled);
        const manifestUrl = result.updateManifestUrl || "";
        setSettingsAutoUpdateEnabled(enabled);
        setSettingsUpdateManifestUrl(manifestUrl);
        setSettingsBaselines((current) => ({
          ...current,
          updates: JSON.stringify({ enabled, manifestUrl: manifestUrl.trim() }),
        }));
        setSettingsMessage("Paramètres de mise à jour enregistrés.");
      }
    } catch (err) {
      setSettingsMessage(err instanceof Error ? err.message : "Impossible d'enregistrer ces paramètres.");
    } finally {
      setSavingSettings(false);
    }
  }

  const currentItems = useMemo(() => {
    const visible = (mail: MailItem) => !deletedIds.includes(mail.id);
    let scoped: MailItem[];

    if (folder === "drafts") {
      scoped = drafts.map((item) => ({
        id: item.id,
        created_at: item.updatedAt,
        to: item.to ? [item.to] : [],
        subject: item.subject || "(Sans objet)",
        from: "Brouillon",
      }));
    } else if (folder.startsWith("custom:")) {
      scoped = allMail.filter((mail) => visible(mail) && mail.localFolder === folder);
    } else if (folder === "sent") {
      scoped = sent.filter((mail) => visible(mail) && !String(mail.localFolder || "sent").startsWith("custom:") && !archivedIds.includes(mail.id) && !trashedIds.includes(mail.id) && !junkIds.includes(mail.id) && !snoozedIds.includes(mail.id));
    } else if (folder === "outbox") {
      scoped = outbox.map((item) => ({
        id: item.id,
        created_at: item.createdAt,
        to: item.to ? [item.to] : [],
        subject: item.subject || "(Sans objet)",
        from: "Boîte d’envoi",
      }));
    } else if (folder === "starred") {
      scoped = allMail.filter((mail) => visible(mail) && starredIds.includes(mail.id) && !trashedIds.includes(mail.id) && !junkIds.includes(mail.id) && !snoozedIds.includes(mail.id));
    } else if (folder === "archive") {
      scoped = allMail.filter((mail) => visible(mail) && archivedIds.includes(mail.id) && !trashedIds.includes(mail.id) && !junkIds.includes(mail.id));
    } else if (folder === "snoozed") {
      scoped = allMail.filter((mail) => visible(mail) && snoozedIds.includes(mail.id));
    } else if (folder === "junk") {
      scoped = allMail.filter((mail) => visible(mail) && junkIds.includes(mail.id));
    } else if (folder === "trash") {
      scoped = allMail.filter((mail) => visible(mail) && trashedIds.includes(mail.id));
    } else {
      scoped = inbox.filter((mail) => visible(mail) && !String(mail.localFolder || "inbox").startsWith("custom:") && !archivedIds.includes(mail.id) && !trashedIds.includes(mail.id) && !junkIds.includes(mail.id) && !snoozedIds.includes(mail.id));
    }

    const term = search.trim().toLowerCase();
    if (term) {
      if (folder !== "outbox" && folder !== "drafts" && localSearchIds !== null) {
        const matchingIds = new Set(localSearchIds);
        scoped = allMail.filter((mail) => visible(mail) && matchingIds.has(mail.id));
      } else {
        scoped = scoped.filter((mail) => [mail.subject, mail.from, ...(mail.to ?? [])].join(" ").toLowerCase().includes(term));
      }
    }

    if (folder !== "outbox" && folder !== "drafts") {
      if (viewFilter === "unread") scoped = scoped.filter((mail) => !readIds.includes(mail.id));
      if (viewFilter === "read") scoped = scoped.filter((mail) => readIds.includes(mail.id));
      if (viewFilter === "starred") scoped = scoped.filter((mail) => starredIds.includes(mail.id));
      if (viewFilter === "flagged") scoped = scoped.filter((mail) => flaggedIds.includes(mail.id));
      if (viewFilter === "pinned") scoped = scoped.filter((mail) => pinnedIds.includes(mail.id));
      if (categoryFilter) scoped = scoped.filter((mail) => mail.category === categoryFilter);
    }

    return [...scoped].sort((left, right) => {
      const a = new Date(left.created_at || 0).getTime();
      const b = new Date(right.created_at || 0).getTime();
      return sortDirection === "newest" ? b - a : a - b;
    });
  }, [allMail, archivedIds, categoryFilter, deletedIds, drafts, flaggedIds, folder, inbox, junkIds, localSearchIds, outbox, pinnedIds, readIds, search, sent, snoozedIds, sortDirection, starredIds, trashedIds, viewFilter]);

  const currentConversationItems = useMemo(() => {
    if (folder === "outbox" || folder === "drafts") return currentItems;

    const grouped = new Map<string, MailItem[]>();
    currentItems.forEach((mail) => {
      const key = conversationIndex.keyById.get(mail.id) || `id:${mail.id}`;
      const group = grouped.get(key) ?? [];
      group.push(mail);
      grouped.set(key, group);
    });

    const representatives = [...grouped.values()].map((group) => [...group].sort((left, right) => {
      return new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime();
    })[0]);

    return representatives.sort((left, right) => {
      const leftPinned = pinnedIds.includes(left.id);
      const rightPinned = pinnedIds.includes(right.id);
      if (leftPinned !== rightPinned) return leftPinned ? -1 : 1;
      const a = new Date(left.created_at || 0).getTime();
      const b = new Date(right.created_at || 0).getTime();
      return sortDirection === "newest" ? b - a : a - b;
    });
  }, [conversationIndex, currentItems, folder, pinnedIds, sortDirection]);

  const groupedConversationItems = useMemo(() => {
    if (groupMode === "none" || folder === "outbox" || folder === "drafts") {
      return [{ label: "", items: currentConversationItems }];
    }

    const groups = new Map<string, MailItem[]>();
    for (const mail of currentConversationItems) {
      const label = mailGroupLabel(mail.created_at, groupMode, pinnedIds.includes(mail.id));
      const items = groups.get(label) ?? [];
      items.push(mail);
      groups.set(label, items);
    }

    return [...groups.entries()].map(([label, items]) => ({ label, items }));
  }, [currentConversationItems, folder, groupMode, pinnedIds]);

  const selectableConversationIds = currentConversationItems.map((mail) => mail.id);
  const visibleSelectedIds = selectedIds.filter((id) => selectableConversationIds.includes(id));
  const allVisibleSelected = selectableConversationIds.length > 0
    && selectableConversationIds.every((id) => visibleSelectedIds.includes(id));

  const unreadCount = inbox.filter((mail) => !readIds.includes(mail.id) && !archivedIds.includes(mail.id) && !trashedIds.includes(mail.id) && !junkIds.includes(mail.id) && !snoozedIds.includes(mail.id) && !deletedIds.includes(mail.id)).length;
  const archiveCount = allMail.filter((mail) => archivedIds.includes(mail.id) && !trashedIds.includes(mail.id) && !deletedIds.includes(mail.id)).length;
  const trashCount = allMail.filter((mail) => trashedIds.includes(mail.id) && !deletedIds.includes(mail.id)).length;
  const junkCount = allMail.filter((mail) => junkIds.includes(mail.id) && !deletedIds.includes(mail.id)).length;
  const snoozedCount = allMail.filter((mail) => snoozedIds.includes(mail.id) && !deletedIds.includes(mail.id)).length;
  const outboxCount = outbox.length;
  const draftCount = drafts.length;

  useEffect(() => {
    if (!window.maildesk) return;
    void window.maildesk.setUnreadCount(unreadCount);
  }, [unreadCount]);

  const systemFolderTitle: Record<SystemFolder, string> = {
    inbox: "Boîte de réception",
    drafts: "Brouillons",
    sent: "Éléments envoyés",
    outbox: "Boîte d’envoi",
    starred: "Favoris",
    archive: "Archives",
    snoozed: "En attente",
    junk: "Indésirables",
    trash: "Corbeille",
  };
  const folderTitle = folder.startsWith("custom:")
    ? customFolders.find((item) => `custom:${item.id}` === folder)?.name || "Dossier"
    : systemFolderTitle[folder as SystemFolder];

  const composeTabTitle = composeKind === "reply"
    ? "Réponse"
    : composeKind === "replyAll"
      ? "Réponse à tous"
      : composeKind === "forward"
        ? "Transfert"
        : composeKind === "draft"
          ? "Brouillon"
          : "Nouveau message";

  function renderComposePane() {
    return (
      <div className="compose-pane">
        <form className="compose-pane-form" onSubmit={sendMail}>
          <div className="compose-pane-head">
            <div>
              <span className="eyebrow">{composeTabTitle}</span>
              <strong>{compose.subject || (composeKind === "new" ? "Nouveau message" : composeTabTitle)}</strong>
            </div>
            <button type="button" className="compose-draft-button" onClick={() => void saveCurrentDraft()} title="Enregistrer comme brouillon">
              <Save size={16} /> Brouillon
            </button>
          </div>
          {identities.length > 0 && (
            <div className="compose-field identity-field">
              <span>De</span>
              <select value={compose.from || defaultIdentityOf(identities, settingsFrom, signature)?.from || ""} onChange={(event) => changeComposeIdentity(event.target.value)}>
                {identities.map((identity) => (
                  <option key={identity.id} value={identity.from}>{identity.name ? `${identity.name} — ${identity.from}` : identity.from}</option>
                ))}
              </select>
            </div>
          )}
          <RecipientInput
            label="À"
            required
            value={compose.to}
            onChange={(value) => setCompose({ ...compose, to: value })}
            trailing={<button type="button" onClick={() => setShowCc((value) => !value)}>Cc/Cci</button>}
          />
          {showCc && <>
            <RecipientInput label="Cc" value={compose.cc} onChange={(value) => setCompose({ ...compose, cc: value })} />
            <RecipientInput label="Cci" value={compose.bcc} onChange={(value) => setCompose({ ...compose, bcc: value })} />
          </>}
          <div className="compose-field"><span>Objet</span><input value={compose.subject} onChange={(event) => setCompose({ ...compose, subject: event.target.value })} /></div>
          {compose.attachments.length > 0 && (
            <div className="compose-attachments">
              {compose.attachments.map((attachment, index) => (
                <span key={`${attachment.name}-${index}`}><Paperclip size={13} />{attachment.name}<small>{formatBytes(attachment.size)}</small><button type="button" onClick={() => setCompose((current) => ({ ...current, attachments: current.attachments.filter((_, itemIndex) => itemIndex !== index) }))}><X size={13} /></button></span>
              ))}
            </div>
          )}
          <RichTextEditor
            value={compose.html}
            onChange={({ html, text }) => setCompose((current) => ({ ...current, html, text }))}
          />
          <div className="compose-actions">
            <button className="send-button" disabled={sending} title={undoSendSeconds > 0 && typeof window !== "undefined" && window.maildesk ? `Envoi différé de ${undoSendSeconds} s pour permettre l’annulation` : "Envoyer maintenant"}>
              <Send size={16} /> {sending ? "Envoi..." : "Envoyer"}
            </button>
            {typeof window !== "undefined" && window.maildesk && (
              <div className="schedule-send-wrap">
                <button type="button" className="icon-button" onClick={openSchedulePicker} title="Envoyer plus tard"><Clock3 size={18} /></button>
                {scheduleOpen && (
                  <div className="schedule-popover">
                    <strong>Envoyer plus tard</strong>
                    <input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />
                    <div>
                      <button type="button" onClick={() => setScheduleOpen(false)}>Annuler</button>
                      <button type="button" className="primary" onClick={() => void scheduleCurrentMail()}>Programmer</button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {templates.length > 0 && (
              <label className="quick-template-picker" title="Modèle / réponse rapide">
                <Zap size={17} />
                <select
                  value=""
                  onChange={(event) => {
                    const template = templates.find((item) => item.id === event.target.value);
                    if (template) applyTemplate(template);
                  }}
                >
                  <option value="">Réponse rapide...</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.shortcut ? `${template.shortcut} — ` : ""}{template.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button type="button" className="icon-button" onClick={() => void addAttachments()} title="Ajouter une pièce jointe"><Paperclip size={18} /></button>
            <button type="button" className="icon-button draft-save-icon" onClick={() => void saveCurrentDraft()} title="Créer / mettre à jour le brouillon"><Save size={18} /></button>
            <span className="draft-state">{typeof window !== "undefined" && window.maildesk ? "Sauvegarde automatique active · disquette pour enregistrer maintenant" : "Brouillon local"}</span>
          </div>
          <input ref={fileInputRef} className="hidden-file-input" type="file" multiple onChange={(event) => void handleBrowserFiles(event)} />
        </form>
      </div>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="icon-button mobile-only" onClick={() => setSidebarOpen((value) => !value)} aria-label="Menu">
          <Menu size={20} />
        </button>
        <div className="global-search">
          <Search size={18} />
          <input
            ref={searchRef}
            value={search}
            onFocus={() => setSearchHelpOpen(true)}
            onBlur={() => window.setTimeout(() => setSearchHelpOpen(false), 140)}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher ou utiliser from:, subject:, has:... (Ctrl+E)"
          />
          {search && <button className="search-clear" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => setSearch("")} title="Effacer"><X size={14} /></button>}
          {searchHelpOpen && (
            <div className="advanced-search-help" onMouseDown={(event) => event.preventDefault()}>
              <div><strong>Recherche avancée</strong><span>Combine plusieurs filtres dans la même requête.</span></div>
              <div className="search-syntax-grid">
                {[
                  ["from:", "from:client@exemple.fr"],
                  ["to:", "to:support@exemple.fr"],
                  ["subject:", "subject:\"devis signé\""],
                  ["has:", "has:attachment"],
                  ["is:", "is:unread"],
                  ["before:", "before:2026-09-01"],
                  ["after:", "after:2026-08-01"],
                  ["category:", "category:blue"],
                  ["folder:", "folder:\"Factures\""],
                ].map(([label, example]) => (
                  <button type="button" key={label} onClick={() => setSearch((current) => current ? `${current} ${example}` : example)}>
                    <code>{label}</code><span>{example}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <button className="icon-button" onClick={() => void openSettings()} aria-label="Paramètres" title="Paramètres"><Settings size={18} /></button>
      </header>

      <div className="workspace">
        <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
          <button className="compose-button" onClick={startCompose}><Edit3 size={18} /> Nouveau message</button>
          <nav className="folder-nav">
            <button
              className={folder === "inbox" ? "active" : ""}
              onClick={() => { setFolder("inbox"); setSidebarOpen(false); }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                event.preventDefault();
                const mailId = event.dataTransfer.getData("application/x-maildesk-mail-id");
                const mail = allMail.find((item) => item.id === mailId);
                if (mail) restoreMail(mail);
              }}
              title="Boîte de réception — déposez un mail ici pour le remettre dans la réception"
            >
              <Inbox size={18} /><span>Boîte de réception</span>{unreadCount > 0 && <strong>{unreadCount}</strong>}
            </button>
            <div className="custom-folder-heading">
              <span>Dossiers</span>
              <button type="button" onClick={createCustomFolder} title="Créer un dossier sous Boîte de réception"><FolderPlus size={15} /></button>
            </div>
            {newFolderOpen && (
              <form className="custom-folder-create" onSubmit={(event) => { event.preventDefault(); void submitCustomFolder(); }}>
                <FolderIcon size={16} />
                <input
                  autoFocus
                  value={newFolderName}
                  onChange={(event) => setNewFolderName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setNewFolderOpen(false);
                      setNewFolderName("");
                    }
                  }}
                  placeholder="Nom du dossier"
                  maxLength={80}
                />
                <button type="submit" disabled={!newFolderName.trim()} title="Créer"><CheckSquare2 size={15} /></button>
                <button type="button" onClick={() => { setNewFolderOpen(false); setNewFolderName(""); }} title="Annuler"><X size={14} /></button>
              </form>
            )}
            {customFolders.map((customFolder) => {
              const customFolderKey: Folder = `custom:${customFolder.id}`;
              const count = allMail.filter((mail) => mail.localFolder === customFolderKey && !deletedIds.includes(mail.id)).length;
              return (
                <div
                  draggable
                  className={folder === customFolderKey ? "custom-folder-row active" : draggedFolderId === customFolder.id ? "custom-folder-row dragging" : "custom-folder-row"}
                  key={customFolder.id}
                  onDragStart={(event) => {
                    setDraggedFolderId(customFolder.id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("application/x-maildesk-folder-id", customFolder.id);
                  }}
                  onDragEnd={() => setDraggedFolderId("")}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const sourceFolderId = event.dataTransfer.getData("application/x-maildesk-folder-id");
                    const mailId = event.dataTransfer.getData("application/x-maildesk-mail-id");
                    if (sourceFolderId) void reorderFolder(sourceFolderId, customFolder.id);
                    else if (mailId) void moveMailToCustomFolder(mailId, customFolder.id);
                  }}
                >
                  <span className="folder-drag-handle" title="Glisser pour réordonner"><GripVertical size={14} /></span>
                  <button className="custom-folder-main" type="button" onClick={() => { setFolder(customFolderKey); setSidebarOpen(false); }}>
                    <FolderIcon size={17} /><span>{customFolder.name}</span>{count > 0 && <em>{count}</em>}
                  </button>
                  <div className="custom-folder-actions">
                    <button type="button" title="Renommer" onClick={() => void renameCustomFolder(customFolder)}><Edit3 size={13} /></button>
                    <button type="button" title="Supprimer" onClick={() => void removeCustomFolder(customFolder)}><X size={13} /></button>
                  </div>
                </div>
              );
            })}
            <button className={folder === "starred" ? "active" : ""} onClick={() => { setFolder("starred"); setSidebarOpen(false); }}>
              <Star size={18} /><span>Favoris</span>
            </button>
            <button className={folder === "drafts" ? "active" : ""} onClick={() => { setFolder("drafts"); setSidebarOpen(false); setSelected(null); setDetail(null); }}>
              <Edit3 size={18} /><span>Brouillons</span>{draftCount > 0 && <em>{draftCount}</em>}
            </button>
            <button className={folder === "sent" ? "active" : ""} onClick={() => { setFolder("sent"); setSidebarOpen(false); }}>
              <Send size={18} /><span>Éléments envoyés</span>
            </button>
            <button className={folder === "outbox" ? "active" : ""} onClick={() => { setFolder("outbox"); setSidebarOpen(false); setSelected(null); setDetail(null); }}>
              <Clock3 size={18} /><span>Boîte d’envoi</span>{outboxCount > 0 && <em>{outboxCount}</em>}
            </button>
            <button className={folder === "archive" ? "active" : ""} onClick={() => { setFolder("archive"); setSidebarOpen(false); }}>
              <Archive size={18} /><span>Archives</span>{archiveCount > 0 && <em>{archiveCount}</em>}
            </button>
            <button className={folder === "snoozed" ? "active" : ""} onClick={() => { setFolder("snoozed"); setSidebarOpen(false); }}>
              <Clock3 size={18} /><span>En attente</span>{snoozedCount > 0 && <em>{snoozedCount}</em>}
            </button>
            <button className={folder === "junk" ? "active" : ""} onClick={() => { setFolder("junk"); setSidebarOpen(false); }}>
              <ShieldBan size={18} /><span>Indésirables</span>{junkCount > 0 && <em>{junkCount}</em>}
            </button>
            <button className={folder === "trash" ? "active" : ""} onClick={() => { setFolder("trash"); setSidebarOpen(false); }}>
              <Trash2 size={18} /><span>Corbeille</span>{trashCount > 0 && <em>{trashCount}</em>}
            </button>
            <button onClick={() => void openContacts()}>
              <ContactRound size={18} /><span>Contacts</span>
            </button>
            <button onClick={() => void openCalendar()}>
              <CalendarDays size={18} /><span>Calendrier</span>
            </button>
          </nav>
          <div className="sidebar-footer">
            <div className="sidebar-footer-account">
              <div className="resend-status">
                <div className="account-dot" />
                <div><strong>Resend</strong><span>{typeof window !== "undefined" && window.maildesk ? "Client Windows" : "Mode navigateur"}</span></div>
              </div>
              <button
                type="button"
                className={mobileProvisioningConfigured ? "mobile-qr-shortcut ready" : "mobile-qr-shortcut"}
                disabled={!mobileProvisioningConfigured || generatingMobileQr}
                onClick={() => void openMobileProvisioningQrFromFooter()}
                title={mobileProvisioningConfigured ? "Afficher le QR de connexion MailDesk Mobile" : mobileProvisioningReason}
                aria-label={mobileProvisioningConfigured ? "Afficher le QR de connexion mobile" : "QR mobile non configuré"}
              >
                <QrCode size={18} />
              </button>
            </div>
            <details className="shortcut-help">
              <summary title="Raccourcis clavier" aria-label="Afficher les raccourcis clavier"><HelpCircle size={18} /></summary>
              <div className="shortcut-help-popover">
                <strong>Raccourcis</strong>
                <div><kbd>Ctrl+N</kbd><span>Nouveau message</span></div>
                <div><kbd>Ctrl+R</kbd><span>Répondre</span></div>
                <div><kbd>Ctrl+5</kbd><span>Contacts</span></div>
                <div><kbd>Suppr</kbd><span>Corbeille</span></div>
              </div>
            </details>
          </div>
        </aside>

        <section className="message-list-pane">
          <div className="pane-heading">
            <div className="pane-heading-main">
              <button className="pane-refresh-button" type="button" onClick={() => void refresh()} title={`Actualiser maintenant · auto ${refreshIntervalLabel(refreshIntervalSeconds)}`}>
                <RefreshCw size={17} />
              </button>
              <div>
                <span className="eyebrow">Courrier</span>
                <h1>{folderTitle}</h1>
              </div>
            </div>
            <button className="icon-button" onClick={() => setSortDirection((value) => value === "newest" ? "oldest" : "newest")} title="Changer l'ordre de tri"><MoreHorizontal size={19} /></button>
          </div>
          <div className="list-toolbar">
            <span>{currentConversationItems.length} {folder === "drafts" ? `brouillon${currentConversationItems.length > 1 ? "s" : ""}` : folder === "outbox" ? `message${currentConversationItems.length > 1 ? "s" : ""}` : `conversation${currentConversationItems.length > 1 ? "s" : ""}`}</span>
            <div className="list-toolbar-controls">
              {folder !== "outbox" && folder !== "drafts" && (
                <>
                  <button
                    type="button"
                    className={multiSelectEnabled ? "toolbar-toggle active" : "toolbar-toggle"}
                    onClick={() => setMultiSelectEnabled((value) => {
                      const next = !value;
                      if (!next) setSelectedIds([]);
                      return next;
                    })}
                    title="Activer ou désactiver la sélection multiple"
                  >
                    <CheckSquare2 size={14} /> Sélection
                  </button>
                  <label>
                    <span>Filtrer</span><ChevronDown size={13} />
                    <select value={viewFilter} onChange={(event) => setViewFilter(event.target.value as ViewFilter)}>
                      <option value="all">Tous</option>
                      <option value="unread">Non lus</option>
                      <option value="read">Lus</option>
                      <option value="starred">Favoris</option>
                      <option value="flagged">Avec drapeau</option>
                      <option value="pinned">Épinglés</option>
                    </select>
                  </label>
                  <label>
                    <CalendarDays size={13} /><span>Regrouper</span><ChevronDown size={13} />
                    <select value={groupMode} onChange={(event) => setGroupMode(event.target.value as GroupMode)}>
                      <option value="smart">Chronologique</option>
                      <option value="day">Par jour</option>
                      <option value="week">Par semaine</option>
                      <option value="month">Par mois</option>
                      <option value="none">Aucun groupe</option>
                    </select>
                  </label>
                  <label>
                    <Tag size={13} /><span>{categoryFilter ? (MAIL_CATEGORIES.find((item) => item.id === categoryFilter)?.label || "Catégorie") : "Catégorie"}</span><ChevronDown size={13} />
                    <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                      <option value="">Toutes</option>
                      {MAIL_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                    </select>
                  </label>
                </>
              )}
              <button onClick={() => setSortDirection((value) => value === "newest" ? "oldest" : "newest")}>{sortDirection === "newest" ? "Plus récents" : "Plus anciens"}</button>
            </div>
          </div>
          {multiSelectEnabled && folder !== "outbox" && folder !== "drafts" && (
            <div className="bulk-selection-bar">
              <button
                type="button"
                className={allVisibleSelected ? "bulk-check checked" : "bulk-check"}
                onClick={() => setSelectedIds(allVisibleSelected ? [] : selectableConversationIds)}
              >
                <span aria-hidden="true">{allVisibleSelected ? "✓" : ""}</span>
                {allVisibleSelected ? "Tout désélectionner" : "Tout sélectionner"}
              </button>
              <strong>{visibleSelectedIds.length} sélectionné{visibleSelectedIds.length > 1 ? "s" : ""}</strong>
              <div className="bulk-actions">
                <button type="button" disabled={!visibleSelectedIds.length} onClick={bulkTrashSelected} title={folder === "trash" ? "Supprimer définitivement" : "Mettre à la corbeille"}><Trash2 size={15} /></button>
                <button type="button" disabled={!visibleSelectedIds.length} onClick={bulkFlagSelected} title="Ajouter ou retirer le drapeau"><Flag size={15} /></button>
                <button type="button" disabled={!visibleSelectedIds.length} onClick={bulkPinSelected} title="Épingler ou désépingler"><Pin size={15} /></button>
              </div>
            </div>
          )}

          {error && <div className="error-banner">{error}</div>}
          <div className="message-list">
            {loading ? Array.from({ length: 7 }).map((_, index) => <div className="mail-skeleton" key={index} />) : currentConversationItems.length === 0 ? (
              <div className="empty-state"><Mail size={34} /><strong>Aucun message</strong><span>Aucun courrier ne correspond à cette vue.</span></div>
            ) : groupedConversationItems.map((group) => (
              <div className="mail-group" key={group.label || "all"}>
                {group.label && (
                  <button
                    type="button"
                    className="mail-group-heading"
                    onClick={() => {
                      const key = `${groupMode}:${group.label}`;
                      setCollapsedMailGroups((items) => items.includes(key) ? removeId(items, key) : addId(items, key));
                    }}
                  >
                    <ChevronDown
                      size={14}
                      className={collapsedMailGroups.includes(`${groupMode}:${group.label}`) ? "collapsed" : ""}
                    />
                    <span>{group.label}</span>
                    <em>{group.items.length}</em>
                  </button>
                )}
                {!collapsedMailGroups.includes(`${groupMode}:${group.label}`) && group.items.map((mail) => {
                  const queued = folder === "outbox" ? outbox.find((item) => item.id === mail.id) : undefined;
                  const draftItem = folder === "drafts" ? drafts.find((item) => item.id === mail.id) : undefined;
                  const threadKey = conversationIndex.keyById.get(mail.id);
                  const thread = threadKey ? (conversationIndex.messagesByKey.get(threadKey) ?? [mail]) : [mail];
                  const threadCount = queued || draftItem ? 1 : thread.length;
                  const unread = !queued && !draftItem && thread.some((item) => !readIds.includes(item.id) && sourceFolder(item) !== "sent");
                  const selectedKey = selected ? conversationIndex.keyById.get(selected.id) : undefined;
                  const active = !queued && Boolean(threadKey && selectedKey === threadKey);
                  const fromSent = !queued && sourceFolder(mail) === "sent";
                  const flagged = flaggedIds.includes(mail.id);
                  const pinned = pinnedIds.includes(mail.id);
                  const multiSelected = selectedIds.includes(mail.id);
                  const displayName = draftItem
                    ? (draftItem.to || "Brouillon")
                    : queued
                      ? (queued.to || "Destinataire")
                      : fromSent
                        ? (mail.to?.join(", ") || "Destinataire")
                        : senderName(mail.from);
                  const initial = displayName.trim().charAt(0).toUpperCase() || "?";
                  const scheduledTime = queued?.nextAttemptAt ? new Date(queued.nextAttemptAt) : null;
                  const isScheduled = Boolean(scheduledTime && scheduledTime.getTime() > Date.now() + 1000);
                  const queueLabel = queued?.status === "sending"
                    ? "Envoi en cours…"
                    : queued?.status === "failed"
                      ? `Échec — ${queued.lastError || "nouvelle tentative programmée"}`
                      : isScheduled && scheduledTime
                        ? `Programmé le ${scheduledTime.toLocaleString("fr-FR")}`
                        : "En attente d’envoi";

                  return (
                    <button
                      key={mail.id}
                      className={`mail-row message-list-row ${unread ? "unread" : ""} ${active ? "selected" : ""} ${multiSelected ? "multi-selected" : ""} ${pinned ? "is-pinned" : ""} ${flagged ? "is-flagged" : ""} ${queued ? "queued" : ""}`}
                      draggable={!queued && !draftItem && !multiSelectEnabled}
                      onDragStart={(event) => {
                        if (queued || draftItem || multiSelectEnabled) return;
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("application/x-maildesk-mail-id", mail.id);
                        event.dataTransfer.setData("text/plain", mail.id);
                      }}
                      onClick={() => {
                        if (multiSelectEnabled && !queued && !draftItem) {
                          toggleSelectedId(mail.id);
                          return;
                        }
                        if (draftItem) openSavedDraft(draftItem);
                        else if (queued) void editOutboxItem(queued);
                        else void openMail(mail);
                      }}
                      onDoubleClick={() => {
                        if (!multiSelectEnabled && !queued && !draftItem) void window.maildesk?.openMessageWindow(mail.id);
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        if (queued || draftItem) return;
                        setSelected(mail);
                        void showContextMenu(mail);
                      }}
                    >
                      <span className="mail-row-leading">
                        {multiSelectEnabled && !queued && !draftItem ? (
                          <span
                            className={multiSelected ? "mail-select-box checked" : "mail-select-box"}
                            role="checkbox"
                            aria-checked={multiSelected}
                            tabIndex={0}
                            onClick={(event) => { event.stopPropagation(); toggleSelectedId(mail.id); }}
                          >
                            {multiSelected ? "✓" : ""}
                          </span>
                        ) : <span className="unread-dot" />}
                      </span>
                      <span className="mail-avatar" aria-hidden="true">{initial}</span>
                      <div className="mail-row-main">
                        <div className="mail-row-top">
                          <strong>{displayName}</strong>
                          {pinned && <span className="mail-state-label"><Pin size={11} /> Épinglé</span>}
                        </div>
                        <div className="mail-subject">
                          {mail.category && <span className={`category-dot category-${mail.category}`} title={`Catégorie ${mail.category}`} />}
                          {mail.subject || "(Sans objet)"}
                          {threadCount > 1 && <span className="thread-count">{threadCount}</span>}
                        </div>
                        <div className={`mail-preview ${queued?.status === "failed" ? "queue-error" : ""}`}>
                          {draftItem
                            ? "Brouillon enregistré"
                            : queued
                              ? queueLabel
                              : folder === "snoozed" && mail.snoozedUntil
                                ? `Revient le ${new Date(mail.snoozedUntil).toLocaleString("fr-FR")}`
                                : threadCount > 1
                                  ? `${threadCount} messages dans cette conversation`
                                  : fromSent
                                    ? "Message envoyé avec Resend"
                                    : mail.from}
                        </div>
                      </div>
                      {draftItem ? (
                        <span className="outbox-row-actions">
                          <span role="button" tabIndex={0} title="Supprimer le brouillon" onClick={(event) => { event.stopPropagation(); void deleteDraftEntry(draftItem.id); }}><Trash2 size={15} /></span>
                        </span>
                      ) : queued ? (
                        <span className="outbox-row-actions">
                          <span role="button" tabIndex={0} title="Réessayer maintenant" onClick={(event) => { event.stopPropagation(); void retryOutboxItem(queued.id); }}><RefreshCw size={15} /></span>
                          <span role="button" tabIndex={0} title="Supprimer de la boîte d’envoi" onClick={(event) => { event.stopPropagation(); void deleteOutboxItem(queued.id); }}><Trash2 size={15} /></span>
                        </span>
                      ) : (
                        <span className="mail-row-side">
                          <span className="mail-quick-actions">
                            <span role="button" tabIndex={0} title={unread ? "Marquer comme lu" : "Marquer comme non lu"} onClick={(event) => { event.stopPropagation(); markRead(mail.id, unread); }}>
                              {unread ? <MailOpen size={15} /> : <Mail size={15} />}
                            </span>
                            <span className={flagged ? "flag-action active" : "flag-action"} role="button" tabIndex={0} title={flagged ? "Retirer le drapeau" : "Marquer comme important"} onClick={(event) => { event.stopPropagation(); toggleFlag(mail.id); }}>
                              <Flag size={15} fill={flagged ? "currentColor" : "none"} />
                            </span>
                            <span className={pinned ? "pin-action active" : "pin-action"} role="button" tabIndex={0} title={pinned ? "Désépingler" : "Épingler en haut"} onClick={(event) => { event.stopPropagation(); togglePin(mail.id); }}>
                              <Pin size={15} fill={pinned ? "currentColor" : "none"} />
                            </span>
                          </span>
                          <span className="mail-side-bottom">
                            <time>{formatDate(mail.created_at)}</time>
                            <span className="trash-action" role="button" tabIndex={0} title={folder === "trash" ? "Supprimer définitivement" : "Mettre à la corbeille"} onClick={(event) => {
                              event.stopPropagation();
                              if (folder === "trash") deleteForever(mail);
                              else trashMail(mail);
                            }}>
                              <Trash2 size={15} />
                            </span>
                          </span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </section>

        <section className="reading-pane">
          {(selected || composeOpen) && <div className="reading-tabs">
            {selected && (
              <button
                type="button"
                className={activeReadingTab === "mail" ? "reading-tab active" : "reading-tab"}
                onClick={() => setActiveReadingTab("mail")}
                title={detail?.subject || selected.subject || "(Sans objet)"}
              >
                <Mail size={14} />
                <span>{detail?.subject || selected.subject || "(Sans objet)"}</span>
              </button>
            )}
            {composeTabs.map((tab) => {
              const active = activeReadingTab === "compose" && tab.id === activeComposeTabId;
              const visibleCompose = tab.id === activeComposeTabId
                ? { ...tab, compose, kind: composeKind, showCc, draftId: currentDraftId || tab.draftId }
                : tab;
              return (
                <div key={tab.id} className={active ? "reading-tab compose-tab active" : "reading-tab compose-tab"}>
                  <button type="button" className="reading-tab-main" onClick={() => void switchComposeTab(tab.id)}>
                    <Edit3 size={14} />
                    <span>{composeTabLabel(visibleCompose.kind, visibleCompose.compose)}</span>
                  </button>
                  <button type="button" className="reading-tab-close" onClick={() => void closeComposeTab(tab.id)} title="Fermer cet onglet et conserver le brouillon"><X size={13} /></button>
                </div>
              );
            })}
          </div>}
          {activeReadingTab === "compose" && composeOpen ? renderComposePane() : !selected ? (
            folder === "outbox"
              ? <div className="reading-empty"><div className="mail-illustration"><Clock3 size={48} /></div><h2>Boîte d’envoi</h2><p>Les messages en attente sont renvoyés automatiquement. Cliquez sur un message pour le modifier, ou utilisez l’icône de retry.</p></div>
              : <div className="reading-empty"><div className="mail-illustration"><Mail size={48} /></div><h2>Sélectionnez un message</h2><p>Clic droit pour afficher toutes les actions disponibles.</p></div>
          ) : detailLoading ? (
            <div className="detail-loading"><div /><div /><div /></div>
          ) : detail ? (
            <>
              <div className="reading-toolbar">
                {typeof window !== "undefined" && window.maildesk && <button className="reading-icon-button" onClick={() => void window.maildesk?.openMessageWindow(detail.id)} title="Ouvrir dans une nouvelle fenêtre" aria-label="Ouvrir dans une nouvelle fenêtre"><ExternalLink size={18} /></button>}
                <button className="reading-icon-button" onClick={() => void printCurrentConversation()} title="Imprimer la conversation" aria-label="Imprimer la conversation"><Printer size={18} /></button>
                <label className="category-quick reading-icon-button" title="Catégorie" aria-label="Catégorie">
                  <Tag size={18} />
                  <select value={detail.category || ""} onChange={(event) => setMailCategory(detail, event.target.value)}>
                    <option value="">Sans catégorie</option>
                    {MAIL_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                </label>
                {trashedIds.includes(detail.id) ? (
                  <>
                    <button className="reading-icon-button" onClick={() => restoreMail(detail)} title="Restaurer" aria-label="Restaurer"><RotateCcw size={18} /></button>
                    <button className="reading-icon-button" onClick={() => deleteForever(detail)} title="Supprimer définitivement" aria-label="Supprimer définitivement"><Trash2 size={18} /></button>
                  </>
                ) : junkIds.includes(detail.id) ? (
                  <>
                    <button className="reading-icon-button" onClick={() => restoreFromJunk(detail)} title="Pas indésirable" aria-label="Pas indésirable"><RotateCcw size={18} /></button>
                    <button className="reading-icon-button" onClick={() => trashMail(detail)} title="Supprimer" aria-label="Supprimer"><Trash2 size={18} /></button>
                  </>
                ) : snoozedIds.includes(detail.id) ? (
                  <>
                    <button className="reading-icon-button" onClick={() => restoreSnoozedMail(detail)} title="Remettre maintenant" aria-label="Remettre maintenant"><RotateCcw size={18} /></button>
                    <button className="reading-icon-button" onClick={() => trashMail(detail)} title="Supprimer" aria-label="Supprimer"><Trash2 size={18} /></button>
                  </>
                ) : archivedIds.includes(detail.id) ? (
                  <>
                    <button className="reading-icon-button" onClick={() => restoreMail(detail)} title="Restaurer" aria-label="Restaurer"><RotateCcw size={18} /></button>
                    <button className="reading-icon-button" onClick={() => trashMail(detail)} title="Supprimer" aria-label="Supprimer"><Trash2 size={18} /></button>
                  </>
                ) : (
                  <>
                    <button className="reading-icon-button" onClick={() => archiveMail(detail)} title="Archiver" aria-label="Archiver"><Archive size={18} /></button>
                    {sourceFolder(detail) !== "sent" && <button className="reading-icon-button" onClick={() => void blockMailSender(detail)} title="Bloquer l’expéditeur" aria-label="Bloquer l’expéditeur"><ShieldBan size={18} /></button>}
                    <button className="reading-icon-button" onClick={() => trashMail(detail)} title="Supprimer" aria-label="Supprimer"><Trash2 size={18} /></button>
                  </>
                )}
                <div className="reading-toolbar-spacer" />
                <div className="message-more-wrap">
                  <button className="reading-icon-button" type="button" onClick={() => setMessageMoreOpen((open) => !open)} title="Plus d’actions" aria-label="Plus d’actions"><MoreHorizontal size={20} /></button>
                  {messageMoreOpen && (
                    <div className="message-more-menu">
                      <button type="button" onClick={() => { setMessageMoreOpen(false); void openRuleBuilderFromMail(detail, "from"); }}><Zap size={17} /><span>Créer une règle</span></button>
                      <button type="button" onClick={() => { setMessageMoreOpen(false); void exportCurrentConversationPdf(); }}><FileDown size={17} /><span>Exporter en PDF</span></button>
                      <button type="button" onClick={() => { setMessageMoreOpen(false); void exportCurrentMessageEml(); }}><FileText size={17} /><span>Exporter en EML</span></button>
                    </div>
                  )}
                </div>
              </div>
              {selectedConversation.length > 1 ? (
                <article className="conversation-detail">
                  <div className="conversation-title">
                    <div>
                      <span className="eyebrow">Conversation · {selectedConversation.length} messages</span>
                      <h2>{detail.subject || "(Sans objet)"}</h2>
                    </div>
                    <div className="conversation-participants">
                      {[...new Set(selectedConversation.flatMap((mail) => [senderEmail(mail.from), ...(mail.to ?? [])]).filter(Boolean))].slice(0, 4).join(", ")}
                    </div>
                  </div>

                  <div className="conversation-stack">
                    {selectedConversation.map((mail, index) => {
                      const expanded = expandedThreadIds.includes(mail.id);
                      const loaded = threadDetails[mail.id] || (detail.id === mail.id ? detail : undefined);
                      const unread = sourceFolder(mail) !== "sent" && !readIds.includes(mail.id);
                      const isLatest = index === selectedConversation.length - 1;
                      return (
                        <section key={mail.id} className={`thread-message ${expanded ? "expanded" : ""} ${unread ? "unread" : ""}`}>
                          <button className="thread-message-header" onClick={() => void toggleThreadMessage(mail)}>
                            <div className="sender-avatar">{senderName(mail.from).slice(0, 2).toUpperCase()}</div>
                            <div className="thread-message-meta">
                              <div><strong>{sourceFolder(mail) === "sent" ? "Moi" : senderName(mail.from)}</strong>{unread && <span className="thread-unread-dot" />}{isLatest && <span className="thread-latest">Récent</span>}</div>
                              <span>{sourceFolder(mail) === "sent" ? `À : ${(mail.to ?? []).join(", ")}` : mail.from}</span>
                            </div>
                            <time>{mail.created_at ? new Date(mail.created_at).toLocaleString("fr-FR") : ""}</time>
                            <ChevronDown size={17} className={expanded ? "thread-chevron expanded" : "thread-chevron"} />
                          </button>

                          {expanded && (
                            <div className="thread-message-content">
                              {!loaded ? (
                                <div className="thread-loading">Chargement du message…</div>
                              ) : (
                                <>
                                  {loaded.attachments?.length ? (
                                    <div className="received-attachments">
                                      {loaded.attachments.map((attachment) => (
                                        <a key={attachment.id} href={attachment.url || `/api/mail/${sourceFolder(mail)}/${mail.id}/attachments/${attachment.id}`} download>
                                          <Paperclip size={15} />
                                          <span><strong>{attachment.filename || "Pièce jointe"}</strong><small>{formatBytes(attachment.size)}</small></span>
                                          <Download size={15} />
                                        </a>
                                      ))}
                                    </div>
                                  ) : null}
                                  <div className="message-body thread-body">
                                    {loaded.html ? (
                                      <SecureMailFrame
                                        title={`Contenu du message de ${senderName(mail.from)}`}
                                        html={loaded.html}
                                        allowRemoteImages={remoteImagesAllowedIds.includes(mail.id)}
                                        onAllowRemoteImages={() => setRemoteImagesAllowedIds((ids) => addId(ids, mail.id))}
                                      />
                                    ) : <pre>{loaded.text || "Aucun contenu texte disponible."}</pre>}
                                  </div>
                                  <div className="thread-message-actions">
                                    <button onClick={() => void startReplyFor(mail)}><Reply size={15} /> Répondre</button>
                                    <button onClick={() => void startReplyFor(mail, true)}><ReplyAll size={15} /> Répondre à tous</button>
                                    <button onClick={() => void startForwardFor(mail)}><Forward size={15} /> Transférer</button>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </section>
                      );
                    })}
                  </div>

                  <div className="reply-strip conversation-reply-strip">
                    <button onClick={() => void startReplyFor(selectedConversation[selectedConversation.length - 1])}><Reply size={17} /> Répondre au dernier</button>
                    <button onClick={() => void startReplyFor(selectedConversation[selectedConversation.length - 1], true)}><ReplyAll size={17} /> Répondre à tous</button>
                    <button onClick={() => void startForwardFor(selectedConversation[selectedConversation.length - 1])}><Forward size={17} /> Transférer</button>
                  </div>
                </article>
              ) : (
                <article className="message-detail">
                  <h2>{detail.subject || "(Sans objet)"}</h2>
                  <div className="sender-card message-sender-card">
                    <div className="sender-avatar">{senderName(detail.from).slice(0, 2).toUpperCase()}</div>
                    <div className="sender-meta">
                      <strong>{senderName(detail.from)}</strong>
                      <span>{detail.from}</span>
                      <small>À : {(detail.to ?? []).join(", ")}</small>
                      {detail.cc?.length ? <small>Cc : {detail.cc.join(", ")}</small> : null}
                    </div>
                    <div className="sender-card-side">
                      <time>{detail.created_at ? new Date(detail.created_at).toLocaleString("fr-FR") : ""}</time>
                      <div className="sender-quick-actions">
                        <button type="button" onClick={() => void startReplyFor(detail)} title="Répondre"><Reply size={17} /></button>
                        <button type="button" onClick={() => void startReplyFor(detail, true)} title="Répondre à tous"><ReplyAll size={17} /></button>
                        <button type="button" onClick={() => void startForwardFor(detail)} title="Transférer"><Forward size={17} /></button>
                        <button type="button" className={flaggedIds.includes(detail.id) ? "active flag" : ""} onClick={() => toggleFlag(detail.id)} title="Important"><Flag size={17} fill={flaggedIds.includes(detail.id) ? "currentColor" : "none"} /></button>
                        <button type="button" className={pinnedIds.includes(detail.id) ? "active pin" : ""} onClick={() => togglePin(detail.id)} title="Épingler"><Pin size={17} fill={pinnedIds.includes(detail.id) ? "currentColor" : "none"} /></button>
                        <button type="button" onClick={() => void showContextMenu(detail)} title="Plus d’actions"><MoreHorizontal size={18} /></button>
                      </div>
                    </div>
                  </div>

                  {detail.attachments?.length ? (
                    <div className="received-attachments">
                      {detail.attachments.map((attachment) => (
                        <a key={attachment.id} href={attachment.url || `/api/mail/${sourceFolder(detail)}/${detail.id}/attachments/${attachment.id}`} download>
                          <Paperclip size={15} />
                          <span><strong>{attachment.filename || "Pièce jointe"}</strong><small>{formatBytes(attachment.size)}</small></span>
                          <Download size={15} />
                        </a>
                      ))}
                    </div>
                  ) : null}

                  <div className="message-body">
                    {detail.html ? (
                      <SecureMailFrame
                        title="Contenu du message"
                        html={detail.html}
                        allowRemoteImages={remoteImagesAllowedIds.includes(detail.id)}
                        onAllowRemoteImages={() => setRemoteImagesAllowedIds((ids) => addId(ids, detail.id))}
                      />
                    ) : <pre>{detail.text || "Aucun contenu texte disponible."}</pre>}
                  </div>
                  <div className="reply-strip">
                    <button onClick={() => void startReplyFor(detail)}><Reply size={17} /> Répondre</button>
                    <button onClick={() => void startReplyFor(detail, true)}><ReplyAll size={17} /> Répondre à tous</button>
                    <button onClick={() => void startForwardFor(detail)}><Forward size={17} /> Transférer</button>
                    <button onClick={() => markRead(detail.id, !readIds.includes(detail.id))}>{readIds.includes(detail.id) ? <Mail size={17} /> : <MailOpen size={17} />} {readIds.includes(detail.id) ? "Non lu" : "Lu"}</button>
                  </div>
                </article>
              )}
            </>
          ) : null}
        </section>
      </div>

      {false && composeOpen && (
        <div className="compose-window legacy-compose-window">
          <div className="compose-header"><strong>{compose.replyToMessageId ? "Réponse" : compose.subject.toLowerCase().startsWith("tr:") ? "Transférer" : "Nouveau message"}</strong><button className="icon-button" onClick={closeCompose} title="Fermer et conserver le brouillon"><X size={18} /></button></div>
          <form onSubmit={sendMail}>
            {identities.length > 0 && (
              <div className="compose-field identity-field">
                <span>De</span>
                <select value={compose.from || defaultIdentityOf(identities, settingsFrom, signature)?.from || ""} onChange={(event) => changeComposeIdentity(event.target.value)}>
                  {identities.map((identity) => (
                    <option key={identity.id} value={identity.from}>{identity.name ? `${identity.name} — ${identity.from}` : identity.from}</option>
                  ))}
                </select>
              </div>
            )}
            <RecipientInput
              label="À"
              required
              value={compose.to}
              onChange={(value) => setCompose({ ...compose, to: value })}
              trailing={<button type="button" onClick={() => setShowCc((value) => !value)}>Cc/Cci</button>}
            />
            {showCc && <>
              <RecipientInput label="Cc" value={compose.cc} onChange={(value) => setCompose({ ...compose, cc: value })} />
              <RecipientInput label="Cci" value={compose.bcc} onChange={(value) => setCompose({ ...compose, bcc: value })} />
            </>}
            <div className="compose-field"><span>Objet</span><input value={compose.subject} onChange={(event) => setCompose({ ...compose, subject: event.target.value })} /></div>
            {compose.attachments.length > 0 && (
              <div className="compose-attachments">
                {compose.attachments.map((attachment, index) => (
                  <span key={`${attachment.name}-${index}`}><Paperclip size={13} />{attachment.name}<small>{formatBytes(attachment.size)}</small><button type="button" onClick={() => setCompose((current) => ({ ...current, attachments: current.attachments.filter((_, itemIndex) => itemIndex !== index) }))}><X size={13} /></button></span>
                ))}
              </div>
            )}
            <RichTextEditor
              value={compose.html}
              onChange={({ html, text }) => setCompose((current) => ({ ...current, html, text }))}
            />
            <div className="compose-actions">
              <button className="send-button" disabled={sending} title={undoSendSeconds > 0 && typeof window !== "undefined" && window.maildesk ? `Envoi différé de ${undoSendSeconds} s pour permettre l’annulation` : "Envoyer maintenant"}>
                <Send size={16} /> {sending ? "Envoi..." : "Envoyer"}
              </button>
              {typeof window !== "undefined" && window.maildesk && (
                <div className="schedule-send-wrap">
                  <button type="button" className="icon-button" onClick={openSchedulePicker} title="Envoyer plus tard"><Clock3 size={18} /></button>
                  {scheduleOpen && (
                    <div className="schedule-popover">
                      <strong>Envoyer plus tard</strong>
                      <input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />
                      <div>
                        <button type="button" onClick={() => setScheduleOpen(false)}>Annuler</button>
                        <button type="button" className="primary" onClick={() => void scheduleCurrentMail()}>Programmer</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {templates.length > 0 && (
                <label className="quick-template-picker" title="Modèle / réponse rapide">
                  <Zap size={17} />
                  <select
                    value=""
                    onChange={(event) => {
                      const template = templates.find((item) => item.id === event.target.value);
                      if (template) applyTemplate(template);
                    }}
                  >
                    <option value="">Réponse rapide...</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.shortcut ? `${template.shortcut} — ` : ""}{template.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button type="button" className="icon-button" onClick={() => void addAttachments()} title="Ajouter une pièce jointe"><Paperclip size={18} /></button>
              <span className="draft-state">{typeof window !== "undefined" && window.maildesk ? "Brouillon sauvegardé dans maildesk.db" : "Brouillon enregistré automatiquement"}</span>
            </div>
            <input ref={fileInputRef} className="hidden-file-input" type="file" multiple onChange={(event) => void handleBrowserFiles(event)} />
          </form>
        </div>
      )}

      {undoSend && outbox.some((item) => item.id === undoSend.item.id) && (
        <div className="undo-send-toast">
          <div>
            <strong>Message en attente</strong>
            <span>Envoi dans quelques secondes : {undoSend.item.subject || "(Sans objet)"}</span>
          </div>
          <button type="button" onClick={() => void undoQueuedSend()}>Annuler l’envoi</button>
        </div>
      )}

      {mobileQrDialogOpen && (
        <div className="modal-backdrop" onMouseDown={() => setMobileQrDialogOpen(false)}>
          <section className="mobile-qr-dialog" onMouseDown={(event) => event.stopPropagation()}>
            <div className="settings-header">
              <div><span className="eyebrow">MailDesk Mobile</span><h2>QR de connexion</h2></div>
              <button className="icon-button" type="button" onClick={() => setMobileQrDialogOpen(false)} title="Fermer"><X size={18} /></button>
            </div>
            <div className="mobile-qr-dialog-body">
              {generatingMobileQr ? (
                <div className="mobile-qr-loading"><QrCode size={38} /><strong>Génération du QR…</strong><span>Préparation de la configuration mobile sécurisée.</span></div>
              ) : mobileQrDialogError ? (
                <div className="mobile-qr-error"><strong>QR indisponible</strong><span>{mobileQrDialogError}</span></div>
              ) : mobileProvisioningQr ? (
                <>
                  <div className="mobile-provisioning-qr"><QRCodeSVG value={mobileProvisioningQr} size={220} level="M" marginSize={2} /></div>
                  <div className="mobile-qr-dialog-copy">
                    <strong>Scanner avec MailDesk Mobile</strong>
                    <span>Projet {mobileProvisioningProjectRef || "Supabase"}</span>
                    <small>Le QR contient uniquement la configuration publique nécessaire à l’application mobile. Aucun secret Resend ou service_role n’est inclus.</small>
                  </div>
                </>
              ) : null}
            </div>
          </section>
        </div>
      )}

      {calendarOpen && (
        <div className="modal-backdrop" onMouseDown={() => setCalendarOpen(false)}>
          <section className="calendar-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="settings-header">
              <div><span className="eyebrow">Agenda local</span><h2>Calendrier MailDesk</h2></div>
              <div className="calendar-header-actions">
                <button type="button" onClick={() => void importCalendarIcs()}><Download size={15} /> Importer ICS</button>
                <button type="button" onClick={() => void exportCalendarIcs()}><FileDown size={15} /> Exporter ICS</button>
                <button className="icon-button" onClick={() => setCalendarOpen(false)}><X size={18} /></button>
              </div>
            </div>
            <div className="calendar-layout">
              <aside className="calendar-editor">
                <div className="calendar-editor-title">
                  <strong>{editingCalendarId ? "Modifier l’événement" : "Nouvel événement"}</strong>
                  {editingCalendarId && <button type="button" onClick={resetCalendarEditor}>Nouveau</button>}
                </div>
                <label><span>Titre</span><input value={calendarTitle} onChange={(event) => setCalendarTitle(event.target.value)} placeholder="Rendez-vous, relance, réunion..." /></label>
                <label><span>Début</span><input type="datetime-local" value={calendarStart} onChange={(event) => setCalendarStart(event.target.value)} /></label>
                <label><span>Fin</span><input type="datetime-local" value={calendarEnd} onChange={(event) => setCalendarEnd(event.target.value)} /></label>
                <label className="calendar-checkbox"><input type="checkbox" checked={calendarAllDay} onChange={(event) => setCalendarAllDay(event.target.checked)} /><span>Journée entière</span></label>
                <label><span>Lieu</span><input value={calendarLocation} onChange={(event) => setCalendarLocation(event.target.value)} placeholder="Bureau, visio, adresse..." /></label>
                <label><span>Participants</span><input value={calendarAttendees} onChange={(event) => setCalendarAttendees(event.target.value)} placeholder="a@exemple.fr, b@exemple.fr" /></label>
                <label><span>Description</span><textarea value={calendarDescription} onChange={(event) => setCalendarDescription(event.target.value)} placeholder="Notes de l’événement..." /></label>
                <button className="calendar-save" type="button" onClick={() => void saveCalendarEntry()} disabled={!calendarTitle.trim() || !calendarStart || !calendarEnd}>
                  <Save size={16} /> Enregistrer
                </button>
              </aside>
              <div className="calendar-agenda">
                <div className="calendar-agenda-head">
                  <div><strong>Agenda</strong><span>{calendarEvents.length} événement{calendarEvents.length > 1 ? "s" : ""}</span></div>
                  <button type="button" onClick={resetCalendarEditor}><Plus size={15} /> Nouveau</button>
                </div>
                <div className="calendar-event-list">
                  {calendarEvents.length === 0 ? (
                    <div className="empty-state"><CalendarDays size={34} /><strong>Aucun événement</strong><span>Créez un rendez-vous ou importez un fichier ICS.</span></div>
                  ) : calendarEvents.map((event) => (
                    <div className="calendar-event-row" key={event.id}>
                      <button type="button" className="calendar-event-main" onClick={() => editCalendarEvent(event)}>
                        <time>
                          <strong>{new Date(event.startAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</strong>
                          <span>{event.allDay ? "Journée" : new Date(event.startAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
                        </time>
                        <span>
                          <strong>{event.title}</strong>
                          <small>{event.location || event.description || "Événement MailDesk"}</small>
                        </span>
                      </button>
                      <button type="button" className="contact-action" title="Supprimer" onClick={() => void deleteCalendarEntry(event.id)}><Trash2 size={15} /></button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {contactsOpen && (
        <div className="modal-backdrop" onMouseDown={() => setContactsOpen(false)}>
          <section className="contacts-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="settings-header">
              <div><span className="eyebrow">Carnet</span><h2>Contacts</h2></div>
              <button className="icon-button" onClick={() => setContactsOpen(false)}><X size={18} /></button>
            </div>

            <div className="contacts-toolbar">
              <label className="contacts-search"><Search size={16} /><input value={contactSearch} onChange={(event) => setContactSearch(event.target.value)} placeholder="Rechercher un contact..." /></label>
              <span>{filteredContacts.length} contact{filteredContacts.length > 1 ? "s" : ""}</span>
            </div>

            <div className="contact-editor">
              <div className="contact-editor-head">
                <strong>{editingContactEmail ? "Modifier le contact" : "Nouveau contact"}</strong>
                {editingContactEmail && <button type="button" onClick={resetContactEditor}>Annuler</button>}
              </div>
              <div className="contact-editor-grid">
                <input value={contactName} onChange={(event) => setContactName(event.target.value)} placeholder="Nom" />
                <input value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} placeholder="email@domaine.fr" type="email" />
                <input value={contactCompany} onChange={(event) => setContactCompany(event.target.value)} placeholder="Société" />
                <input value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} placeholder="Téléphone" />
                <input className="wide" value={contactTags} onChange={(event) => setContactTags(event.target.value)} placeholder="Tags : client, partenaire, urgent..." />
                <textarea className="wide" value={contactNotes} onChange={(event) => setContactNotes(event.target.value)} placeholder="Notes internes..." />
              </div>
              <button className="contact-save-button" type="button" onClick={() => void saveContactEntry()} disabled={!contactEmail.trim()}>
                <Save size={15} /> {editingContactEmail ? "Enregistrer" : "Ajouter"}
              </button>
            </div>

            <div className="contacts-list">
              {filteredContacts.length === 0 ? (
                <div className="empty-state"><ContactRound size={34} /><strong>Aucun contact</strong><span>Les correspondants apparaîtront automatiquement à mesure que vous échangez des mails.</span></div>
              ) : filteredContacts.map((contact) => (
                <div className="contact-row" key={contact.email}>
                  <button className="contact-main" type="button" onClick={() => composeToContact(contact)}>
                    <span className="contact-avatar">{(contact.name || contact.email).slice(0, 2).toUpperCase()}</span>
                    <span className="contact-copy">
                      <strong>{contact.name || contact.email}</strong>
                      <span>{contact.email}{contact.company ? ` · ${contact.company}` : ""}{contact.phone ? ` · ${contact.phone}` : ""}</span>
                      <small>
                        {contact.tags.length > 0 ? `${contact.tags.join(" · ")} · ` : ""}
                        {contact.source === "manual" ? "Contact enregistré" : contact.timesSeen + " échange" + (contact.timesSeen > 1 ? "s" : "")}
                      </small>
                    </span>
                  </button>
                  <button className="contact-action" type="button" title="Modifier" onClick={() => editContactEntry(contact)}><Edit3 size={16} /></button>
                  <button className={contact.isFavorite ? "contact-action favorite" : "contact-action"} type="button" title="Favori" onClick={() => void toggleContactFavorite(contact)}><Star size={16} fill={contact.isFavorite ? "currentColor" : "none"} /></button>
                  <button className="contact-action" type="button" title="Supprimer du carnet" onClick={() => void deleteContactEntry(contact.email)}><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {settingsOpen && (
        <div className="modal-backdrop" onMouseDown={closeSettings}>
          <section className="settings-modal settings-modal-tabbed" onMouseDown={(event) => event.stopPropagation()}>
            <div className="settings-header settings-tabbed-header">
              <div><span className="eyebrow">Configuration</span><h2>Paramètres MailDesk</h2></div>
              <div className="settings-header-actions">
                <button className="icon-button" type="button" onClick={closeSettings} title="Fermer"><X size={18} /></button>
              </div>
            </div>

            <div className="settings-shell">
              <aside className="settings-side-nav">
                <button type="button" className={settingsTab === "account" ? "active" : ""} onClick={() => setSettingsTab("account")}><UserRound size={17} /><span><strong>Compte</strong><small>Identités & Resend</small></span></button>
                <button type="button" className={settingsTab === "sending" ? "active" : ""} onClick={() => setSettingsTab("sending")}><Send size={17} /><span><strong>Envoi</strong><small>Délais & comportement</small></span></button>
                <button type="button" className={settingsTab === "refresh" ? "active" : ""} onClick={() => setSettingsTab("refresh")}><RefreshCw size={17} /><span><strong>Actualisation</strong><small>Fréquence de relève</small></span></button>
                <button type="button" className={settingsTab === "appearance" ? "active" : ""} onClick={() => setSettingsTab("appearance")}><Palette size={17} /><span><strong>Apparence</strong><small>Couleur du thème</small></span></button>
                <button type="button" className={settingsTab === "rules" ? "active" : ""} onClick={() => setSettingsTab("rules")}><Zap size={17} /><span><strong>Règles</strong><small>Tri automatique</small></span></button>
                <button type="button" className={settingsTab === "templates" ? "active" : ""} onClick={() => setSettingsTab("templates")}><FileText size={17} /><span><strong>Modèles</strong><small>Réponses rapides</small></span></button>
                <button type="button" className={settingsTab === "windows" ? "active" : ""} onClick={() => setSettingsTab("windows")}><Settings size={17} /><span><strong>Windows</strong><small>Intégration système</small></span></button>
                <button type="button" className={settingsTab === "data" ? "active" : ""} onClick={() => setSettingsTab("data")}><Database size={17} /><span><strong>Données</strong><small>Sauvegarde locale</small></span></button>
                <button type="button" className={settingsTab === "supabase" ? "active" : ""} onClick={() => setSettingsTab("supabase")}><Database size={17} /><span><strong>Supabase</strong><small>Cloud & synchronisation</small></span></button>
                <button type="button" className={settingsTab === "updates" ? "active" : ""} onClick={() => setSettingsTab("updates")}><RefreshCw size={17} /><span><strong>Mises à jour</strong><small>Version & auto-update</small></span></button>
              </aside>

              <form className="settings-tab-content" onSubmit={(event) => { event.preventDefault(); void saveActiveSettingsTab(); }}>
                {settingsTab === "account" && (
                  <section className="settings-tab-panel">
                    <div className="settings-panel-title"><div><span className="eyebrow">Compte</span><h3>Identités d’envoi</h3><p>Adresses Resend et signatures utilisées par le composeur.</p></div>{settingsPanelSaveButton("account")}</div>
                    <div className="identity-settings-list">
                      {materializedSettingsIdentities().map((identity) => (
                        <div className={identity.isDefault ? "identity-settings-card default" : "identity-settings-card"} key={identity.id}>
                          <div className="identity-settings-head">
                            <div><strong>{identity.isDefault ? "Identité principale" : (identity.name || "Identité secondaire")}</strong>{identity.isDefault && <span>Par défaut</span>}</div>
                            <div className="identity-settings-actions">
                              {!identity.isDefault && <button type="button" onClick={() => makeIdentityDefault(identity.id)}>Définir par défaut</button>}
                              {!identity.isDefault && <button type="button" className="danger" onClick={() => deleteIdentitySetting(identity.id)} title="Supprimer l’identité"><Trash2 size={15} /></button>}
                            </div>
                          </div>
                          <div className="identity-settings-grid">
                            <label><span>Nom</span><input value={identity.name} onChange={(event) => updateIdentitySetting(identity.id, { name: event.target.value })} placeholder="Commercial, Support, Personnel..." /></label>
                            <label><span>Adresse d’envoi Resend</span><input value={identity.isDefault ? settingsFrom : identity.from} onChange={(event) => identity.isDefault ? setSettingsFrom(event.target.value) : updateIdentitySetting(identity.id, { from: event.target.value })} placeholder="Nom <mail@votre-domaine.fr>" /></label>
                          </div>
                          <label><span>Signature</span><SignatureEditor value={identity.isDefault ? settingsSignature : identity.signature} onChange={(value) => identity.isDefault ? setSettingsSignature(value) : updateIdentitySetting(identity.id, { signature: value })} /></label>
                        </div>
                      ))}
                      <button className="add-identity-button" type="button" onClick={addIdentitySetting}><Plus size={15} /> Ajouter une identité</button>
                    </div>
                    <label className="settings-field"><span>Clé API Resend</span><input type="password" value={settingsApiKey} onChange={(event) => setSettingsApiKey(event.target.value)} placeholder={settingsHasApiKey ? "Clé déjà enregistrée — laisser vide pour la conserver" : "re_..."} /><small>Stockée chiffrée avec Windows safeStorage.</small></label>
                  </section>
                )}

                {settingsTab === "sending" && (
                  <section className="settings-tab-panel">
                    <div className="settings-panel-title"><div><span className="eyebrow">Envoi</span><h3>Comportement du composeur</h3><p>Contrôlez le délai d’annulation avant le départ réel du message.</p></div>{settingsPanelSaveButton("sending")}</div>
                    <div className="send-settings">
                      <label><span>Délai pour annuler l’envoi</span><select value={settingsUndoSendSeconds} onChange={(event) => setSettingsUndoSendSeconds(Number(event.target.value))}><option value={0}>Désactivé — envoyer immédiatement</option><option value={5}>5 secondes</option><option value={10}>10 secondes</option><option value={20}>20 secondes</option><option value={30}>30 secondes</option></select></label>
                      <p>« Envoyer plus tard » reste disponible indépendamment de ce délai.</p>
                    </div>
                  </section>
                )}

                {settingsTab === "refresh" && (
                  <section className="settings-tab-panel">
                    <div className="settings-panel-title">
                      <div>
                        <span className="eyebrow">Relève automatique</span>
                        <h3>Actualisation de la boîte</h3>
                        <p>MailDesk vérifie périodiquement les nouveaux messages sans bloquer l’interface.</p>
                      </div>
                      {settingsPanelSaveButton("refresh")}
                    </div>
                    <div className="refresh-settings-card">
                      <div className="refresh-settings-value">
                        <span>Fréquence actuelle</span>
                        <strong>{refreshIntervalLabel(settingsRefreshIntervalSeconds)}</strong>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={REFRESH_INTERVALS.length - 1}
                        step={1}
                        value={refreshIntervalIndex(settingsRefreshIntervalSeconds)}
                        onChange={(event) => setSettingsRefreshIntervalSeconds(REFRESH_INTERVALS[Number(event.target.value)])}
                        title="Une fréquence très courte augmente fortement le nombre de requêtes vers Resend. 5 secondes est le minimum recommandé uniquement pour les tests."
                      />
                      <div className="refresh-scale">
                        {REFRESH_INTERVALS.map((seconds) => <span key={seconds}>{refreshIntervalLabel(seconds)}</span>)}
                      </div>
                      <div className={settingsRefreshIntervalSeconds <= 10 ? "refresh-warning strong" : "refresh-warning"}>
                        <RefreshCw size={16} />
                        <span>
                          {settingsRefreshIntervalSeconds <= 10
                            ? "Attention : une relève toutes les 5–10 secondes génère beaucoup plus de requêtes. À réserver aux tests ou aux boîtes très actives."
                            : "Plus l’intervalle est court, plus MailDesk interroge Resend fréquemment. 30 s à 1 min est un bon compromis pour un usage courant."}
                        </span>
                      </div>
                    </div>
                  </section>
                )}

                {settingsTab === "appearance" && (
                  <section className="settings-tab-panel">
                    <div className="settings-panel-title">
                      <div><span className="eyebrow">Personnalisation</span><h3>Thème couleur</h3><p>Choisissez une couleur MailDesk ou utilisez votre propre couleur.</p></div>
                      {settingsPanelSaveButton("appearance")}
                    </div>
                    <div className="theme-settings-card">
                      <div className="theme-preview" style={{ background: settingsThemeColor }}>
                        <Image src="/logo_app_mail_resend_64.webp" width={34} height={34} alt="" />
                        <div><strong>MailDesk</strong><span>Aperçu de la couleur principale</span></div>
                      </div>
                      <div className="theme-presets">
                        {THEME_PRESETS.map((theme) => (
                          <button
                            key={theme.color}
                            type="button"
                            className={normalizeThemeColor(settingsThemeColor) === theme.color ? "active" : ""}
                            onClick={() => setSettingsThemeColor(theme.color)}
                            title={theme.name}
                          >
                            <span style={{ background: theme.color }} />
                            <strong>{theme.name}</strong>
                          </button>
                        ))}
                      </div>
                      <label className="theme-custom-color">
                        <span>Couleur personnalisée</span>
                        <div>
                          <input type="color" value={normalizeThemeColor(settingsThemeColor)} onChange={(event) => setSettingsThemeColor(event.target.value)} />
                          <input value={settingsThemeColor} onChange={(event) => setSettingsThemeColor(event.target.value)} onBlur={() => setSettingsThemeColor(normalizeThemeColor(settingsThemeColor))} placeholder="#0f6cbd" />
                        </div>
                      </label>
                      <div className="security-note"><Palette size={16} /><strong>Aperçu instantané</strong><span>La couleur est prévisualisée immédiatement. Fermez sans enregistrer pour revenir au thème précédent.</span></div>
                    </div>
                  </section>
                )}

                {settingsTab === "rules" && (
                  <section className="settings-tab-panel">
                    <div className="settings-panel-title"><div><span className="eyebrow">Automatisation V2</span><h3>Règles de courrier</h3><p>Combinez plusieurs conditions et plusieurs actions, dans l’ordre de priorité choisi.</p></div>{settingsPanelSaveButton("rules")}</div>

                    <div className="rule-builder rule-builder-v2">
                      <div className="rule-v2-head">
                        <input value={ruleName} onChange={(event) => setRuleName(event.target.value)} placeholder="Nom de la règle (optionnel)" />
                        <label><span>Correspondance</span><select value={ruleMatchMode} onChange={(event) => { setRuleMatchMode(event.target.value as "all" | "any"); setRuleTestResult(null); }}><option value="all">Toutes les conditions (ET)</option><option value="any">Au moins une condition (OU)</option></select></label>
                        <label><span>Priorité</span><input type="number" min={0} max={9999} value={rulePriority} onChange={(event) => setRulePriority(Math.max(0, Math.min(9999, Number(event.target.value) || 0)))} /></label>
                        <label className="rule-stop-option"><input type="checkbox" checked={ruleStopProcessing} onChange={(event) => setRuleStopProcessing(event.target.checked)} /><span>Arrêter les règles suivantes si celle-ci correspond</span></label>
                      </div>

                      <div className="rule-v2-section-title"><strong>Conditions</strong><button type="button" onClick={addRuleCondition}><Plus size={14} /> Ajouter une condition</button></div>
                      <div className="rule-v2-stack">
                        {ruleConditions.map((condition, index) => (
                          <div className="rule-v2-row" key={condition.id}>
                            <span className="rule-v2-index">{index + 1}</span>
                            <select value={condition.field} onChange={(event) => updateRuleCondition(condition.id, { field: event.target.value as MailRuleConditionEntry["field"] })}><option value="from">Expéditeur</option><option value="subject">Objet</option><option value="to">Destinataire</option></select>
                            <select value={condition.operator} onChange={(event) => updateRuleCondition(condition.id, { operator: event.target.value as MailRuleConditionEntry["operator"] })}><option value="contains">contient</option><option value="equals">est exactement</option><option value="ends_with">se termine par</option></select>
                            <input value={condition.value} onChange={(event) => updateRuleCondition(condition.id, { value: event.target.value })} placeholder="Valeur à rechercher" />
                            <button type="button" className="rule-v2-remove" disabled={ruleConditions.length === 1} onClick={() => removeRuleCondition(condition.id)} title="Retirer cette condition"><Trash2 size={14} /></button>
                          </div>
                        ))}
                      </div>

                      <div className="rule-v2-section-title"><strong>Actions</strong><button type="button" onClick={addRuleAction}><Plus size={14} /> Ajouter une action</button></div>
                      <div className="rule-v2-stack">
                        {ruleActions.map((action, index) => (
                          <div className="rule-v2-row rule-v2-action-row" key={action.id}>
                            <span className="rule-v2-index">{index + 1}</span>
                            <select value={action.type} onChange={(event) => updateRuleAction(action.id, { type: event.target.value as MailRuleActionEntry["type"], value: "" })}>
                              <option value="archive">Archiver</option>
                              <option value="star">Ajouter aux favoris</option>
                              <option value="read">Marquer comme lu</option>
                              <option value="trash">Déplacer dans la corbeille</option>
                              <option value="move_to_folder">Déplacer vers un dossier</option>
                              <option value="webhook">Appeler un webhook externe</option>
                            </select>
                            {action.type === "move_to_folder" ? (
                              <div className="rule-v2-target rule-folder-target">
                                <select
                                  value={action.value || ""}
                                  onChange={(event) => {
                                    if (event.target.value === "__create__") {
                                      beginRuleFolderCreate(action.id);
                                      return;
                                    }
                                    cancelRuleFolderCreate();
                                    updateRuleAction(action.id, { value: event.target.value });
                                  }}
                                >
                                  <option value="">Choisir un dossier...</option>
                                  <option value="__create__">＋ Créer le dossier...</option>
                                  {customFolders.map((customFolder) => <option key={customFolder.id} value={customFolder.id}>{customFolder.name}</option>)}
                                </select>
                                {ruleFolderCreateActionId === action.id && (
                                  <div className="rule-folder-create">
                                    <input
                                      autoFocus
                                      value={ruleFolderCreateName}
                                      onChange={(event) => setRuleFolderCreateName(event.target.value)}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                          event.preventDefault();
                                          void submitRuleFolderCreate(action.id);
                                        }
                                        if (event.key === "Escape") {
                                          event.preventDefault();
                                          cancelRuleFolderCreate();
                                        }
                                      }}
                                      placeholder="Nom du nouveau dossier"
                                      maxLength={80}
                                    />
                                    <button type="button" onClick={() => void submitRuleFolderCreate(action.id)} disabled={!ruleFolderCreateName.trim()} title="Créer le dossier"><FolderPlus size={14} /></button>
                                    <button type="button" onClick={cancelRuleFolderCreate} title="Annuler"><X size={14} /></button>
                                  </div>
                                )}
                              </div>
                            ) : action.type === "webhook" ? (
                              <input className="rule-v2-target" type="url" value={action.value || ""} onChange={(event) => updateRuleAction(action.id, { value: event.target.value })} placeholder="https://exemple.fr/webhooks/maildesk" />
                            ) : <div className="rule-v2-target rule-v2-no-target">Aucune cible supplémentaire</div>}
                            <button type="button" className="rule-v2-remove" disabled={ruleActions.length === 1} onClick={() => removeRuleAction(action.id)} title="Retirer cette action"><Trash2 size={14} /></button>
                          </div>
                        ))}
                      </div>

                      <div className="rule-v2-help">Les webhooks sont envoyés en POST JSON avec file locale, déduplication et retry. Leur URL reste locale à MailDesk et n’est pas synchronisée vers Supabase.</div>
                      <div className="rule-builder-actions rule-builder-actions-v2">
                        <button type="button" onClick={() => void testRuleDraft()}>Tester sans appliquer</button>
                        <button type="button" onClick={() => void runRulesNow()} disabled={rules.length === 0}>Appliquer les règles enregistrées aux messages existants</button>
                      </div>

                      {ruleTestResult && (
                        <div className="rule-test-result">
                          <strong>{ruleTestResult.matched} message{ruleTestResult.matched > 1 ? "s" : ""} correspondant{ruleTestResult.matched > 1 ? "s" : ""}</strong>
                          {ruleTestResult.samples.map((sample) => <span key={sample.id}>{sample.from || "Expéditeur inconnu"} — {sample.subject}</span>)}
                        </div>
                      )}
                    </div>

                    <div className="settings-subtitle">Règles enregistrées</div>
                    {rules.length === 0 ? <div className="settings-message">Aucune règle enregistrée.</div> : (
                      <div className="rules-list">{rules.map((rule) => (
                        <div className={rule.enabled ? "rule-row rule-row-v2" : "rule-row rule-row-v2 disabled"} key={rule.id}>
                          <button type="button" className="rule-toggle" onClick={() => void toggleRule(rule)} aria-label={rule.enabled ? "Désactiver la règle" : "Activer la règle"}><span className={rule.enabled ? "switch on" : "switch"}><i /></span></button>
                          <div className="rule-copy">
                            <strong>{rule.name}</strong>
                            <small>Priorité {rule.priority} · {rule.matchMode === "all" ? "ET" : "OU"} · {rule.conditions.length} condition{rule.conditions.length > 1 ? "s" : ""} · {rule.actions.length} action{rule.actions.length > 1 ? "s" : ""}{rule.stopProcessing ? " · arrêt après correspondance" : ""}</small>
                            <span>{rule.conditions.map((condition) => `${ruleFieldLabel(condition.field)} ${ruleOperatorLabel(condition.operator)} “${condition.value}”`).join(rule.matchMode === "all" ? " ET " : " OU ")}</span>
                            <span className="rule-actions-summary">→ {rule.actions.map((action) => ruleActionLabel(action, customFolders)).join(" + ")}</span>
                          </div>
                          <button type="button" className="rule-delete" onClick={() => void deleteRuleEntry(rule.id)} title="Supprimer la règle"><Trash2 size={15} /></button>
                        </div>
                      ))}</div>
                    )}

                    <div className="settings-subtitle">Activité récente des règles</div>
                    {ruleRuns.length === 0 ? <div className="settings-message">Aucune règle déclenchée récemment.</div> : (
                      <div className="rule-run-list">{ruleRuns.slice(0, 12).map((run) => (
                        <div className="rule-run-row" key={run.id}>
                          <span><strong>{run.ruleName}</strong><small>{new Date(run.createdAt).toLocaleString("fr-FR")}</small></span>
                          <span>{run.actions.map((action) => ruleActionLabel({ id: "", type: action.type, value: action.value }, customFolders)).join(" + ")}</span>
                        </div>
                      ))}</div>
                    )}

                    <div className="settings-subtitle">Expéditeurs bloqués</div>
                    <div className="blocked-senders">{blockedSenders.length === 0 ? <div className="settings-message">Aucun expéditeur bloqué.</div> : blockedSenders.map((sender) => <div className="blocked-sender-row" key={sender.email}><span><ShieldBan size={15} /><strong>{sender.email}</strong></span><button type="button" onClick={() => void unblockMailSender(sender.email)}>Débloquer</button></div>)}</div>
                  </section>
                )}

                {settingsTab === "templates" && (
                  <section className="settings-tab-panel">
                    <div className="settings-panel-title"><div><span className="eyebrow">Productivité</span><h3>Modèles & réponses rapides</h3><p>Les modèles sont proposés directement dans le composeur.</p></div>{settingsPanelSaveButton("templates")}</div>
                    <div className="settings-template-layout">
                      <div className="template-list">
                        <button type="button" className="template-new" onClick={resetTemplateEditor}><Plus size={14} /> Nouveau modèle</button>
                        {templates.length === 0 ? <div className="settings-message">Aucun modèle.</div> : templates.map((template) => (
                          <div className={template.id === templateId ? "template-list-row active" : "template-list-row"} key={template.id}>
                            <button type="button" onClick={() => selectTemplateForEditing(template)}><strong>{template.name}</strong><small>{template.shortcut || template.subject || "Réponse rapide"}</small></button>
                            <button type="button" title="Supprimer" onClick={() => void deleteTemplateEntry(template.id)}><Trash2 size={14} /></button>
                          </div>
                        ))}
                      </div>
                      <div className="template-editor">
                        <label><span>Nom</span><input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Réponse SAV, Relance devis..." /></label>
                        <label><span>Raccourci</span><input value={templateShortcut} onChange={(event) => setTemplateShortcut(event.target.value)} placeholder="/sav, /devis..." /></label>
                        <label><span>Objet proposé</span><input value={templateSubject} onChange={(event) => setTemplateSubject(event.target.value)} placeholder="Objet du message" /></label>
                        <label><span>Texte</span><textarea value={templateText} onChange={(event) => setTemplateText(event.target.value)} placeholder="Version texte de la réponse..." /></label>
                        <label><span>HTML</span><textarea className="template-html" value={templateHtml} onChange={(event) => setTemplateHtml(event.target.value)} placeholder="<p>Votre réponse mise en forme...</p>" /></label>
                      </div>
                    </div>
                  </section>
                )}

                {settingsTab === "windows" && (
                  <section className="settings-tab-panel">
                    <div className="settings-panel-title"><div><span className="eyebrow">Système</span><h3>Intégration Windows</h3><p>Les changements sont appliqués uniquement avec la disquette.</p></div>{settingsPanelSaveButton("windows")}</div>
                    <div className="windows-integration-grid">
                      <label className="windows-option"><input type="checkbox" checked={settingsStartWithWindows} disabled={!settingsIsPackaged} onChange={(event) => setSettingsStartWithWindows(event.target.checked)} /><span><strong>Démarrer avec Windows</strong><small>Lance MailDesk automatiquement à l’ouverture de session.</small></span></label>
                      <label className="windows-option"><input type="checkbox" checked={settingsMailtoRegistered} disabled={!settingsIsPackaged} onChange={(event) => setSettingsMailtoRegistered(event.target.checked)} /><span><strong>Ouvrir les liens mailto: avec MailDesk</strong><small>Les liens e-mail de Windows ouvrent directement un nouveau message.</small></span></label>
                    </div>
                    {!settingsIsPackaged && <div className="security-note"><strong>Version développement</strong><span>Ces options sont disponibles dans le client Windows installé.</span></div>}
                    <div className="security-note"><Bell size={16} /><strong>Notifications interactives</strong><span>Ouvrir et Marquer lu sont maintenant disponibles depuis Windows.</span></div>
                  </section>
                )}

                {settingsTab === "data" && (
                  <section className="settings-tab-panel">
                    <div className="settings-panel-title"><div><span className="eyebrow">Données locales</span><h3>Sauvegarde & profil</h3><p>Aucun paramètre à enregistrer ici : la disquette reste grisée.</p></div>{settingsPanelSaveButton("data")}</div>
                    <div className="security-note"><strong>MailDesk {settingsAppVersion || "développement"}</strong><span>{settingsUserDataPath || databasePath || "Profil MailDesk"}</span><span>La sauvegarde inclut mails, brouillons, boîte d’envoi, contacts, règles, modèles, calendrier, catégories et états locaux.</span></div>
                    <div className="supabase-actions"><button type="button" className="primary-outline" onClick={() => void exportLocalBackup()}>Exporter une sauvegarde</button><button type="button" onClick={() => void restoreLocalBackup()}>Restaurer une sauvegarde</button><button type="button" onClick={() => void openLocalDataFolder()}>Ouvrir le dossier de données</button></div>
                  </section>
                )}

                {settingsTab === "supabase" && (
                  <section className="settings-tab-panel">
                    <div className="settings-panel-title"><div><span className="eyebrow">Cloud optionnel</span><h3>Synchronisation Supabase</h3><p>Mails, contacts, dossiers, règles, modèles et calendrier peuvent être synchronisés.</p></div>{settingsPanelSaveButton("supabase")}</div>
                    <label className="settings-field"><span>URL du projet Supabase</span><input value={settingsSupabaseUrl} onChange={(event) => { setSettingsSupabaseUrl(event.target.value); setMobileProvisioningQr(""); }} placeholder="https://xxxx.supabase.co" /></label>
                    <label className="settings-field"><span>Project Ref</span><input value={settingsSupabaseProjectRef} onChange={(event) => { setSettingsSupabaseProjectRef(event.target.value); setMobileProvisioningQr(""); }} placeholder="Détecté automatiquement depuis l’URL si possible" /></label>
                    <label className="settings-field"><span>Clé de synchronisation</span><input type="password" value={settingsSupabaseKey} onChange={(event) => { setSettingsSupabaseKey(event.target.value); setMobileProvisioningQr(""); }} placeholder={settingsHasSupabaseKey ? "Clé déjà enregistrée — laisser vide pour la conserver" : "service_role / sb_secret_…"} /></label>
                    <label className="settings-field"><span>Token Supabase Management API</span><input type="password" value={settingsSupabaseManagementToken} onChange={(event) => { setSettingsSupabaseManagementToken(event.target.value); setMobileProvisioningQr(""); }} placeholder={settingsHasSupabaseManagementToken ? "Token déjà enregistré — laisser vide pour la conserver" : "sbp_… : database_write + api_gateway_keys_read + edge_functions_write"} /></label>
                    <div className="security-note edge-api-summary">
                      <strong>API mobile Supabase Edge</strong>
                      <span>L’URL n’a plus besoin d’être saisie : MailDesk la calcule automatiquement depuis l’URL du projet Supabase.</span>
                      <code>{supabaseEdgeApiUrl || "https://<project-ref>.supabase.co/functions/v1/maildesk-api"}</code>
                    </div>
                    <div className="security-note"><strong>Initialisation automatique</strong><span>Le token Management API permet à MailDesk de créer/réparer toutes ses tables, tester la Data API, récupérer la clé publishable du QR mobile et déployer l’Edge Function.</span></div>
                    <div className="supabase-actions"><button type="button" className="primary-outline" onClick={() => void initializeSupabaseFromSettings()} disabled={initializingSupabase || !settingsSupabaseUrl || !(settingsSupabaseKey || settingsHasSupabaseKey) || !(settingsSupabaseManagementToken || settingsHasSupabaseManagementToken)}>{initializingSupabase ? "Initialisation..." : "Créer / réparer les tables"}</button><button type="button" onClick={() => void syncNowFromSettings()} disabled={!settingsSupabaseUrl || !(settingsSupabaseKey || settingsHasSupabaseKey)}>Synchroniser maintenant</button><button type="button" className="primary-outline" onClick={() => void generateMobileProvisioningQr()} disabled={generatingMobileQr || !settingsSupabaseUrl}>{generatingMobileQr ? "Génération..." : "QR de connexion mobile"}</button></div>
                    <details className="edge-wiki">
                      <summary><Database size={16} /><span>Wiki configuration Supabase Edge</span><ChevronDown size={14} /></summary>
                      <div className="edge-wiki-body">
                        <div className="edge-wiki-step">
                          <span className="edge-wiki-index">1</span>
                          <div><strong>Tables MailDesk</strong><p>Crée ou répare les tables de synchronisation utilisées par MailDesk Desktop et Mobile.</p><button type="button" onClick={() => void initializeSupabaseFromSettings()} disabled={initializingSupabase || !settingsSupabaseUrl || !(settingsSupabaseKey || settingsHasSupabaseKey) || !(settingsSupabaseManagementToken || settingsHasSupabaseManagementToken)}>{initializingSupabase ? "Initialisation..." : "Créer / réparer les tables"}</button></div>
                        </div>
                        <div className="edge-wiki-step">
                          <span className="edge-wiki-index">2</span>
                          <div><strong>Edge Function maildesk-api</strong><p>Déploie ou met à jour automatiquement la fonction qui expose Inbox, Envoyés, détail, pièces jointes, envoi et profil mobile.</p><code>{supabaseEdgeApiUrl || "URL calculée après saisie de l’URL Supabase"}</code><button type="button" className="primary-outline" onClick={() => void deployMobileEdgeFromSettings()} disabled={deployingMobileEdge || !settingsSupabaseUrl || !(settingsSupabaseManagementToken || settingsHasSupabaseManagementToken)}>{deployingMobileEdge ? "Déploiement..." : "Créer / mettre à jour l’API Edge"}</button>{edgeDeployMessage && <small>{edgeDeployMessage}</small>}</div>
                        </div>
                        <div className="edge-wiki-step">
                          <span className="edge-wiki-index">3</span>
                          <div><strong>Secrets Edge requis</strong><p>À renseigner dans Supabase → Edge Functions → Secrets. Les secrets ne sont jamais intégrés au QR.</p><div className="edge-secret-list"><code>RESEND_API_KEY</code><code>RESEND_FROM</code><code>MAILDESK_MOBILE_ALLOWED_EMAILS</code><span>ou</span><code>MAILDESK_MOBILE_ALLOWED_USER_IDS</code><code className="optional">MAILDESK_MOBILE_SIGNATURE_HTML (optionnel)</code></div></div>
                        </div>
                        <div className="edge-wiki-step">
                          <span className="edge-wiki-index">4</span>
                          <div><strong>Permissions du token Management API</strong><p><code>database_write</code> pour les tables, <code>api_gateway_keys_read</code> pour la clé mobile et <code>edge_functions_write</code> pour déployer l’API Edge.</p></div>
                        </div>
                        <div className="edge-wiki-step">
                          <span className="edge-wiki-index">5</span>
                          <div><strong>Provisionnement mobile</strong><p>Une fois l’Edge Function et ses secrets prêts, générez le QR. Le mobile recevra automatiquement l’URL Edge calculée ; aucun backend séparé n’est nécessaire.</p></div>
                        </div>
                      </div>
                    </details>
                    <div className="security-note"><strong>QR mobile sécurisé</strong><span>Le QR ne contient jamais la clé service_role / sb_secret. Il contient uniquement l’URL Supabase, la clé publishable/anon et l’URL Edge MailDesk calculée automatiquement.</span></div>
                    {mobileProvisioningQr && (
                      <div className="mobile-provisioning-card">
                        <div className="mobile-provisioning-qr"><QRCodeSVG value={mobileProvisioningQr} size={196} level="M" marginSize={2} /></div>
                        <div className="mobile-provisioning-copy"><strong>Scanner avec MailDesk Mobile</strong><span>Projet {mobileProvisioningProjectRef || settingsSupabaseProjectRef || "Supabase"}</span><span>Le téléphone enregistrera cette configuration dans son stockage sécurisé puis affichera directement la connexion.</span><small>Ce QR configure l’application ; il ne connecte pas automatiquement un utilisateur et ne contient aucun mot de passe.</small></div>
                      </div>
                    )}
                  </section>
                )}

                {settingsTab === "updates" && (
                  <section className="settings-tab-panel">
                    <div className="settings-panel-title"><div><span className="eyebrow">Application</span><h3>Mises à jour</h3><p>Manifest HTTPS + vérification SHA-256 avant installation.</p></div>{settingsPanelSaveButton("updates")}</div>
                    <label className="windows-option update-toggle"><input type="checkbox" checked={settingsAutoUpdateEnabled} onChange={(event) => setSettingsAutoUpdateEnabled(event.target.checked)} /><span><strong>Rechercher automatiquement les mises à jour</strong><small>Vérification au démarrage puis toutes les 6 heures.</small></span></label>
                    <label className="settings-field"><span>URL HTTPS du manifest latest.json</span><input value={settingsUpdateManifestUrl} onChange={(event) => setSettingsUpdateManifestUrl(event.target.value)} placeholder="https://votre-domaine.fr/maildesk/latest.json" /></label>
                    <div className="update-manifest-example"><strong>Format attendu</strong><pre>{"{\n  \"version\": \"0.4.6\",\n  \"url\": \"https://votre-domaine.fr/MailDesk-Setup-0.4.6-x64.exe\",\n  \"sha256\": \"SHA256_DU_SETUP\",\n  \"notes\": \"Corrections et améliorations\"\n}"}</pre></div>
                    <div className="supabase-actions"><button type="button" className="primary-outline" onClick={() => void checkUpdatesNow()} disabled={checkingUpdates || !settingsUpdateManifestUrl.trim()}>{checkingUpdates ? "Vérification..." : "Vérifier maintenant"}</button>{updateReady && <button type="button" className="update-install-button" onClick={() => void installReadyUpdate()}>Installer la mise à jour</button>}</div>
                    {updateStatusMessage && <div className="settings-message">{updateStatusMessage}</div>}
                  </section>
                )}

                {settingsMessage && <div className="settings-message settings-global-message">{settingsMessage}</div>}
              </form>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
