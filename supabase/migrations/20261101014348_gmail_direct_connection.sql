-- Gmail credentials are never readable through an authenticated browser session.
create table public.sst_gmail_connection (
 singleton boolean primary key default true check(singleton),
 email text not null check(email='educornejoperea28@gmail.com'),
 ciphertext text not null, iv text not null,
 connected_at timestamptz not null default now()
);
create table public.sst_gmail_setup_sessions (
 id uuid primary key default gen_random_uuid(),
 ticket_hash text unique not null,
 state text unique, cookie_hash text, nonce text, pkce_verifier text,
 status text not null default 'prepared' check(status in ('prepared','authorizing','exchanging','completed','failed')),
 expires_at timestamptz not null,
 created_at timestamptz not null default now()
);
alter table public.sst_gmail_connection enable row level security;
alter table public.sst_gmail_setup_sessions enable row level security;
revoke all on public.sst_gmail_connection, public.sst_gmail_setup_sessions from public, anon, authenticated;
grant select,insert,update on public.sst_gmail_connection, public.sst_gmail_setup_sessions to service_role;
