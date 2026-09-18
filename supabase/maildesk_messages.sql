create table if not exists public.maildesk_messages (
  id text primary key,
  direction text not null check (direction in ('inbound', 'outbound')),
  created_at timestamptz null,
  from_addr text null,
  to_json jsonb not null default '[]'::jsonb,
  cc_json jsonb not null default '[]'::jsonb,
  bcc_json jsonb not null default '[]'::jsonb,
  reply_to_json jsonb not null default '[]'::jsonb,
  subject text null,
  message_id text null,
  headers_json jsonb not null default '{}'::jsonb,
  parent_message_id text null,
  references_json jsonb not null default '[]'::jsonb,
  html text null,
  text_body text null,
  attachments_json jsonb not null default '[]'::jsonb,
  folder text not null default 'inbox',
  is_read boolean not null default false,
  is_starred boolean not null default false,
  is_flagged boolean not null default false,
  is_pinned boolean not null default false,
  is_deleted boolean not null default false,
  category text null,
  snoozed_until timestamptz null,
  updated_at timestamptz not null default now()
);

alter table public.maildesk_messages
  add column if not exists headers_json jsonb not null default '{}'::jsonb,
  add column if not exists parent_message_id text null,
  add column if not exists references_json jsonb not null default '[]'::jsonb,
  add column if not exists category text null,
  add column if not exists snoozed_until timestamptz null,
  add column if not exists is_flagged boolean not null default false,
  add column if not exists is_pinned boolean not null default false;

create table if not exists public.maildesk_contacts (
  email text primary key,
  name text not null default '',
  company text not null default '',
  phone text not null default '',
  notes text not null default '',
  tags_json jsonb not null default '[]'::jsonb,
  times_seen integer not null default 0,
  last_seen_at timestamptz null,
  is_favorite boolean not null default false,
  is_hidden boolean not null default false,
  source text not null default 'learned' check (source in ('learned', 'manual')),
  updated_at timestamptz not null default now()
);

alter table public.maildesk_contacts
  add column if not exists company text not null default '',
  add column if not exists phone text not null default '',
  add column if not exists notes text not null default '',
  add column if not exists tags_json jsonb not null default '[]'::jsonb;

create table if not exists public.maildesk_folders (
  id text primary key,
  name text not null,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.maildesk_folders
  add column if not exists is_deleted boolean not null default false;

drop index if exists public.maildesk_folders_name_idx;

create unique index maildesk_folders_name_idx
  on public.maildesk_folders (lower(name))
  where is_deleted = false;

create table if not exists public.maildesk_rules (
  id text primary key,
  name text not null,
  field text not null check (field in ('from', 'subject', 'to')),
  operator text not null check (operator in ('contains', 'equals', 'ends_with')),
  value text not null,
  action text not null check (action in ('archive', 'star', 'read', 'trash', 'move_to_folder')),
  action_value text null,
  enabled boolean not null default true,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.maildesk_rules
  add column if not exists action_value text null,
  add column if not exists is_deleted boolean not null default false;

alter table public.maildesk_rules
  drop constraint if exists maildesk_rules_action_check;

alter table public.maildesk_rules
  add constraint maildesk_rules_action_check
  check (action in ('archive', 'star', 'read', 'trash', 'move_to_folder'));

create index if not exists maildesk_messages_folder_created_idx
  on public.maildesk_messages (folder, created_at desc);

create index if not exists maildesk_messages_updated_idx
  on public.maildesk_messages (updated_at);

create index if not exists maildesk_messages_message_id_idx
  on public.maildesk_messages (message_id);

create index if not exists maildesk_messages_parent_message_id_idx
  on public.maildesk_messages (parent_message_id);

create index if not exists maildesk_contacts_rank_idx
  on public.maildesk_contacts (is_favorite desc, times_seen desc, last_seen_at desc);

create index if not exists maildesk_rules_enabled_idx
  on public.maildesk_rules (enabled, created_at);

create table if not exists public.maildesk_templates (
  id text primary key,
  name text not null,
  subject text not null default '',
  html text not null default '',
  text_body text not null default '',
  shortcut text not null default '',
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.maildesk_calendar_events (
  id text primary key,
  title text not null,
  description text not null default '',
  location text not null default '',
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default false,
  attendees_json jsonb not null default '[]'::jsonb,
  source_uid text null,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists maildesk_templates_name_idx
  on public.maildesk_templates (is_deleted, name);

create index if not exists maildesk_calendar_events_start_idx
  on public.maildesk_calendar_events (is_deleted, start_at);

-- MailDesk synchronizes through a server/secret project key stored with Windows safeStorage.
-- Public anonymous access stays closed even if the project's Data API exposes public.
alter table public.maildesk_messages enable row level security;
alter table public.maildesk_contacts enable row level security;
alter table public.maildesk_folders enable row level security;
alter table public.maildesk_rules enable row level security;
alter table public.maildesk_templates enable row level security;
alter table public.maildesk_calendar_events enable row level security;

revoke all on table public.maildesk_messages from anon, authenticated;
revoke all on table public.maildesk_contacts from anon, authenticated;
revoke all on table public.maildesk_folders from anon, authenticated;
revoke all on table public.maildesk_rules from anon, authenticated;
revoke all on table public.maildesk_templates from anon, authenticated;
revoke all on table public.maildesk_calendar_events from anon, authenticated;

grant select, insert, update, delete on table public.maildesk_messages to service_role;
grant select, insert, update, delete on table public.maildesk_contacts to service_role;
grant select, insert, update, delete on table public.maildesk_folders to service_role;
grant select, insert, update, delete on table public.maildesk_rules to service_role;
grant select, insert, update, delete on table public.maildesk_templates to service_role;
grant select, insert, update, delete on table public.maildesk_calendar_events to service_role;
