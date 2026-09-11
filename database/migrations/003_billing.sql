alter table subscription_accounts
  add column if not exists provider text,
  add column if not exists provider_customer_id text,
  add column if not exists provider_subscription_id text,
  add column if not exists provider_plan_id text,
  add column if not exists provider_event_time bigint,
  add column if not exists provider_event_id text,
  add column if not exists current_period_start timestamptz,
  add column if not exists current_period_end timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists reconciliation_reason text;

create unique index if not exists subscription_accounts_provider_subscription_uq
  on subscription_accounts(provider, provider_subscription_id)
  where provider_subscription_id is not null;

create table if not exists billing_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  provider text not null,
  event_id text not null,
  event_type text not null,
  provider_created_at bigint not null check (provider_created_at >= 0),
  provider_subscription_id text not null,
  provider_payment_id text,
  mapped_state text not null check (mapped_state in ('FREE','CHECKOUT_PENDING','AUTHENTICATED','ACTIVE','PAST_DUE','HALTED','CANCEL_PENDING','CANCELLED','EXPIRED','RECONCILIATION_REQUIRED')),
  raw_digest char(64) not null,
  processing_result text not null check (processing_result in ('ACCEPTED','IGNORED_STALE','DUPLICATE','RECONCILIATION_REQUIRED','FAILED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider, event_id)
);

create index if not exists billing_events_org_time_idx on billing_events(organization_id, created_at desc);
create index if not exists billing_events_subscription_idx on billing_events(provider, provider_subscription_id, provider_created_at desc);
