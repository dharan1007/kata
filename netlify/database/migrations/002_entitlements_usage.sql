create table if not exists subscription_accounts (
  organization_id uuid primary key references organizations(id) on delete cascade,
  plan_id text not null default 'free' check (plan_id in ('free','developer','team','enterprise')),
  state text not null default 'FREE' check (state in ('FREE','CHECKOUT_PENDING','AUTHENTICATED','ACTIVE','PAST_DUE','HALTED','CANCEL_PENDING','CANCELLED','EXPIRED','RECONCILIATION_REQUIRED')),
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);

create table if not exists entitlement_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  subscription_version bigint not null,
  effective_plan_id text not null check (effective_plan_id in ('free','developer','team','enterprise')),
  capabilities jsonb not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists usage_buckets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  metric text not null,
  window_start timestamptz not null,
  window_end timestamptz not null,
  limit_units integer not null check (limit_units >= 0),
  used_units integer not null default 0 check (used_units >= 0),
  reserved_units integer not null default 0 check (reserved_units >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, metric, window_start),
  check (used_units + reserved_units <= limit_units)
);

create table if not exists usage_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  metric text not null,
  idempotency_key text not null,
  bucket_id uuid not null references usage_buckets(id) on delete cascade,
  units integer not null check (units > 0),
  state text not null check (state in ('RESERVED','COMMITTED','RELEASED')),
  outcome text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  unique (organization_id, metric, idempotency_key)
);

create table if not exists usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  reservation_id uuid not null unique references usage_reservations(id) on delete cascade,
  metric text not null,
  units integer not null check (units > 0),
  outcome text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists ci_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  environment_id uuid references project_environments(id) on delete cascade,
  prefix text not null unique,
  token_hash char(64) not null unique,
  scopes jsonb not null,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists entitlement_snapshots_org_idx on entitlement_snapshots(organization_id, created_at desc);
create index if not exists usage_buckets_current_idx on usage_buckets(organization_id, metric, window_start desc);
create index if not exists usage_events_org_time_idx on usage_events(organization_id, created_at desc);
create index if not exists ci_tokens_project_idx on ci_tokens(project_id, environment_id, created_at desc);
