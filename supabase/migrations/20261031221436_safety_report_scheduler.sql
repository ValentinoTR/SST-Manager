-- Install after supabase-modules.sql. No browser credentials or Google tokens here.
begin;
create table sst_private.report_worker_auth (
 singleton boolean primary key default true check(singleton),
 token text not null default (gen_random_uuid()::text||gen_random_uuid()::text)
);
insert into sst_private.report_worker_auth(singleton) values(true);
alter table sst_private.report_worker_auth enable row level security;
revoke all on sst_private.report_worker_auth from public,anon,authenticated;
grant usage on schema sst_private to service_role;
grant select on sst_private.report_worker_auth to service_role;
create function public.sst_is_report_worker(candidate text) returns boolean
 language sql stable security invoker set search_path='' as $$
 select candidate<>'' and exists(select 1 from sst_private.report_worker_auth where token=candidate)
$$;
revoke all on function public.sst_is_report_worker(text) from public,anon,authenticated;
grant execute on function public.sst_is_report_worker(text) to service_role;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
-- pg_cron persists the schedule; pg_net executes while every browser is closed.
select cron.schedule('sst-safety-reports','* * * * *', $cron$
 select net.http_post(
  url:='https://dxhlobdjcfhjatyxrntx.supabase.co/functions/v1/sst-reports',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select token from sst_private.report_worker_auth where singleton)),
  body:='{}'::jsonb,
  timeout_milliseconds:=90000
 );
$cron$);
commit;
