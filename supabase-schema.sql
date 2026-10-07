-- Private single-user app data. Run once in Supabase SQL Editor.
create table if not exists public.sst_app_state (
    user_id uuid primary key references auth.users (id) on delete cascade,
    payload jsonb not null,
    updated_at timestamptz not null default now()
);

alter table public.sst_app_state enable row level security;
revoke all on table public.sst_app_state from anon;
grant select, insert, update on table public.sst_app_state to authenticated;

create policy "Read own SST state"
    on public.sst_app_state for select to authenticated
    using ((select auth.uid()) = user_id);

create policy "Insert own SST state"
    on public.sst_app_state for insert to authenticated
    with check ((select auth.uid()) = user_id);

create policy "Update own SST state"
    on public.sst_app_state for update to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit)
values ('sst-attachments', 'sst-attachments', false, 10485760)
on conflict (id) do update
set public = false, file_size_limit = 10485760;

create policy "Read own SST attachments"
    on storage.objects for select to authenticated
    using (
        bucket_id = 'sst-attachments'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

create policy "Upload own SST attachments"
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'sst-attachments'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

create policy "Update own SST attachments"
    on storage.objects for update to authenticated
    using (
        bucket_id = 'sst-attachments'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    )
    with check (
        bucket_id = 'sst-attachments'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

create policy "Delete own SST attachments"
    on storage.objects for delete to authenticated
    using (
        bucket_id = 'sst-attachments'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );
