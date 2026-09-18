export {};

type NativeMailAction = {
  action: string;
  id?: string;
  folder?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  text?: string;
};

type ElectronAttachment = {
  name: string;
  size: number;
  content: string;
  type?: string;
};

type LocalMail = {
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
  headers?: Record<string, string> | null;
  in_reply_to?: string;
  references?: string[];
  html?: string | null;
  text?: string | null;
  category?: string;
  snoozedUntil?: string;
  localFlagged?: boolean;
  localPinned?: boolean;
  attachments?: Array<{
    id?: string;
    filename?: string | null;
    size?: number;
    content_type?: string;
    content_disposition?: string | null;
  }>;
};

type MailIdentity = {
  id: string;
  name: string;
  from: string;
  signature: string;
  isDefault: boolean;
};

type LocalDraft = {
  id: string;
  from: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  text: string;
  html: string;
  replyToMessageId?: string;
  replyReferences?: string[];
  attachments: ElectronAttachment[];
  updatedAt: string;
};

type OutboxItem = {
  id: string;
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
  attachments?: ElectronAttachment[];
  status: "pending" | "sending" | "failed";
  attempts: number;
  lastError: string;
  nextAttemptAt?: string;
  sendAt?: string;
  createdAt: string;
  updatedAt: string;
};

type ContactItem = {
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

type MailTemplate = {
  id: string;
  name: string;
  subject: string;
  html: string;
  text: string;
  shortcut: string;
  createdAt: string;
  updatedAt: string;
};

type CalendarEventItem = {
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

type CustomFolder = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

type MailRule = {
  id: string;
  name: string;
  field: "from" | "subject" | "to";
  operator: "contains" | "equals" | "ends_with";
  value: string;
  action: "archive" | "star" | "read" | "trash" | "move_to_folder";
  actionValue?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type LocalSnapshot = {
  databasePath: string;
  messages: LocalMail[];
  missingBodyIds: string[];
  readIds: string[];
  starredIds: string[];
  flaggedIds: string[];
  pinnedIds: string[];
  archivedIds: string[];
  trashedIds: string[];
  junkIds: string[];
  snoozedIds: string[];
  deletedIds: string[];
};

type SyncResult = {
  configured: boolean;
  ok: boolean;
  mode: string;
  message: string;
  rows?: number;
  contacts?: number;
  folders?: number;
  rules?: number;
  templates?: number;
  calendarEvents?: number;
};

declare global {
  interface Window {
    maildesk?: {
      isElectron: boolean;
      showMailContextMenu: (payload: {
        id: string;
        folder: string;
        isRead: boolean;
        isStarred: boolean;
        isFlagged?: boolean;
        isPinned?: boolean;
        canBlock?: boolean;
      }) => Promise<void>;
      pickAttachments: () => Promise<ElectronAttachment[]>;
      printDocument: (payload: { title: string; html: string }) => Promise<{ ok: boolean; canceled?: boolean; message?: string }>;
      exportPdf: (payload: { title: string; html: string }) => Promise<{ ok: boolean; canceled?: boolean; path?: string }>;
      exportEml: (payload: { title: string; folder: "inbox" | "sent"; message: LocalMail }) => Promise<{ ok: boolean; canceled?: boolean; path?: string }>;
      notifyNewMail: (payload: { id?: string; count: number; title?: string; body?: string }) => Promise<boolean>;
      getSettings: () => Promise<{
        from: string;
        signature: string;
        identities: MailIdentity[];
        undoSendSeconds: number;
        supabaseUrl: string;
        supabaseProjectRef: string;
        hasApiKey: boolean;
        hasSupabaseKey: boolean;
        hasSupabaseManagementToken: boolean;
        autoUpdateEnabled: boolean;
        updateManifestUrl: string;
        databasePath: string;
        isPackaged: boolean;
      }>;
      saveSettings: (settings: {
        from?: string;
        apiKey?: string;
        signature?: string;
        identities?: MailIdentity[];
        undoSendSeconds?: number;
        supabaseUrl?: string;
        supabaseKey?: string;
        supabaseProjectRef?: string;
        supabaseManagementToken?: string;
        autoUpdateEnabled?: boolean;
        updateManifestUrl?: string;
      }) => Promise<{
        from: string;
        signature: string;
        identities: MailIdentity[];
        undoSendSeconds: number;
        supabaseUrl: string;
        supabaseProjectRef: string;
        hasApiKey: boolean;
        hasSupabaseKey: boolean;
        hasSupabaseManagementToken: boolean;
        autoUpdateEnabled: boolean;
        updateManifestUrl: string;
        sync?: SyncResult;
        requiresDevRestart?: boolean;
      }>;
      initializeSupabase: (settings: {
        from: string;
        apiKey?: string;
        signature?: string;
        identities?: MailIdentity[];
        undoSendSeconds?: number;
        supabaseUrl: string;
        supabaseKey?: string;
        supabaseProjectRef?: string;
        supabaseManagementToken?: string;
      }) => Promise<{
        ok: boolean;
        message: string;
        from: string;
        signature: string;
        identities: MailIdentity[];
        undoSendSeconds: number;
        projectRef?: string;
        table?: string;
        sync?: SyncResult;
        supabaseProjectRef: string;
        hasSupabaseKey: boolean;
        hasSupabaseManagementToken: boolean;
      }>;
      getActiveDraft: () => Promise<LocalDraft | null>;
      saveActiveDraft: (draft: Omit<LocalDraft, "id" | "updatedAt">) => Promise<LocalDraft>;
      deleteActiveDraft: () => Promise<boolean>;
      listDrafts: () => Promise<LocalDraft[]>;
      getDraft: (id: string) => Promise<LocalDraft | null>;
      saveDraft: (draft: Omit<LocalDraft, "updatedAt">) => Promise<LocalDraft>;
      deleteDraft: (id: string) => Promise<boolean>;
      getOutbox: () => Promise<OutboxItem[]>;
      enqueueOutbox: (payload: {
        from: string;
        to: string;
        cc: string;
        bcc: string;
        subject: string;
        text: string;
        html: string;
        replyToMessageId?: string;
        replyReferences?: string[];
        idempotencyKey: string;
        sendAt?: string;
        attachments: ElectronAttachment[];
      }) => Promise<OutboxItem>;
      deleteOutbox: (id: string) => Promise<boolean>;
      retryOutbox: (id: string) => Promise<OutboxItem[]>;
      processOutbox: () => Promise<OutboxItem[]>;
      listContacts: (limit?: number) => Promise<ContactItem[]>;
      searchContacts: (query: string, limit?: number) => Promise<ContactItem[]>;
      saveContact: (contact: {
        email: string;
        name?: string;
        company?: string;
        phone?: string;
        notes?: string;
        tags?: string[];
        isFavorite?: boolean;
      }) => Promise<ContactItem>;
      deleteContact: (email: string) => Promise<boolean>;
      listBlockedSenders: () => Promise<Array<{ email: string; createdAt: string }>>;
      blockSender: (from: string) => Promise<{ email: string; createdAt: string }>;
      unblockSender: (email: string) => Promise<boolean>;
      listCustomFolders: () => Promise<CustomFolder[]>;
      saveCustomFolder: (folder: { id?: string; name: string }) => Promise<CustomFolder>;
      deleteCustomFolder: (id: string) => Promise<{ ok: boolean; moved: number; deletedRules: number }>;
      listRules: () => Promise<MailRule[]>;
      saveRule: (rule: {
        id?: string;
        name?: string;
        field: MailRule["field"];
        operator: MailRule["operator"];
        value: string;
        action: MailRule["action"];
        actionValue?: string;
        enabled?: boolean;
      }) => Promise<MailRule>;
      deleteRule: (id: string) => Promise<boolean>;
      runRules: () => Promise<{ matched: number; snapshot: LocalSnapshot }>;
      listTemplates: () => Promise<MailTemplate[]>;
      saveTemplate: (template: {
        id?: string;
        name: string;
        subject?: string;
        html?: string;
        text?: string;
        shortcut?: string;
      }) => Promise<MailTemplate>;
      deleteTemplate: (id: string) => Promise<boolean>;
      listCalendarEvents: (range?: { from?: string; to?: string }) => Promise<CalendarEventItem[]>;
      saveCalendarEvent: (event: {
        id?: string;
        title: string;
        description?: string;
        location?: string;
        startAt: string;
        endAt: string;
        allDay?: boolean;
        attendees?: string[];
        sourceUid?: string;
      }) => Promise<CalendarEventItem>;
      deleteCalendarEvent: (id: string) => Promise<boolean>;
      importCalendarIcs: () => Promise<{ ok: boolean; canceled?: boolean; imported?: number }>;
      exportCalendarIcs: () => Promise<{ ok: boolean; canceled?: boolean; path?: string }>;
      openMessageWindow: (id: string) => Promise<boolean>;
      checkForUpdates: () => Promise<{
        ok: boolean;
        available: boolean;
        downloaded?: boolean;
        currentVersion?: string;
        latestVersion?: string;
        notes?: string;
        installerPath?: string;
        message: string;
      }>;
      installPendingUpdate: () => Promise<{ ok: boolean; message?: string }>;
      exportBackup: () => Promise<{ ok: boolean; canceled?: boolean; path?: string }>;
      restoreBackup: () => Promise<{
        ok: boolean;
        canceled?: boolean;
        databasePath?: string;
        safetyCopy?: string;
        snapshot?: LocalSnapshot;
      }>;
      openDataFolder: () => Promise<{ ok: boolean; path: string; error?: string }>;
      getAppInfo: () => Promise<{
        version: string;
        isPackaged: boolean;
        userDataPath: string;
        databasePath: string;
      }>;
      getWindowsIntegration: () => Promise<{ isPackaged: boolean; openAtLogin: boolean; mailtoRegistered: boolean }>;
      setWindowsStartup: (enabled: boolean) => Promise<{ isPackaged: boolean; openAtLogin: boolean; mailtoRegistered: boolean; ok: boolean; message?: string }>;
      setMailtoHandler: (enabled: boolean) => Promise<{ isPackaged: boolean; openAtLogin: boolean; mailtoRegistered: boolean; ok: boolean }>;
      setUnreadCount: (count: number) => Promise<number>;
      rendererReady: () => Promise<boolean>;
      getLocalSnapshot: () => Promise<LocalSnapshot>;
      searchLocalMail: (query: string, limit?: number) => Promise<LocalMail[]>;
      getLocalMail: (id: string) => Promise<LocalMail | null>;
      cacheMailLists: (payload: { inbox: LocalMail[]; sent: LocalMail[] }) => Promise<LocalSnapshot>;
      cacheMailDetail: (payload: { mail: LocalMail; direction: "inbound" | "outbound" }) => Promise<LocalMail | null>;
      updateLocalMailState: (payload: {
        id: string;
        patch: { folder?: string; isRead?: boolean; isStarred?: boolean; isFlagged?: boolean; isPinned?: boolean; isDeleted?: boolean; category?: string; snoozedUntil?: string | null };
      }) => Promise<LocalMail | null>;
      syncNow: () => Promise<SyncResult>;
      onMailContextAction: (callback: (payload: NativeMailAction) => void) => () => void;
      onAppAction: (callback: (payload: NativeMailAction) => void) => () => void;
      onOutboxUpdated: (callback: (payload: OutboxItem[]) => void) => () => void;
    };
  }
}
