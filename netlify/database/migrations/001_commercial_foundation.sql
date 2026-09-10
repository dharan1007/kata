create table users (
  id uuid primary key default gen_random_uuid(),
  identity_subject text not null unique,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  kind text not null check (kind in ('PERSONAL','TEAM')),
  created_by uuid not null references users(id),
  personal_owner_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (personal_owner_user_id)
);

create table organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('OWNER','ADMIN','MEMBER')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('ADMIN','MEMBER')),
  token_hash char(64) not null unique,
  expires_at timestamptz not null,
  created_by uuid not null references users(id),
  accepted_by uuid references users(id),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  default_target_url text not null,
  visibility text not null check (visibility in ('PUBLIC','PRIVATE')),
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, slug)
);

create table project_environments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  target_url text not null,
  expected_origin text not null,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (project_id, name)
);

create table api_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  prefix text not null unique,
  secret_hash char(64) not null unique,
  scopes jsonb not null,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz
);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  actor_type text not null check (actor_type in ('user','service','operator','system')),
  actor_id text,
  action text not null,
  target_type text,
  target_id text,
  outcome text not null,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index organization_members_user_idx on organization_members(user_id, organization_id);
create index organization_invitations_org_idx on organization_invitations(organization_id, created_at desc);
create index projects_org_idx on projects(organization_id, created_at desc);
create index project_environments_project_idx on project_environments(project_id, created_at desc);
create index api_keys_org_idx on api_keys(organization_id, created_at desc);
create index audit_events_org_time_idx on audit_events(organization_id, created_at desc);
