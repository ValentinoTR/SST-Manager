begin;
-- Privileged implementation stays outside the exposed API schema.
alter function public.sst_resolve_defect(uuid,text,text) set schema sst_private;
create function public.sst_resolve_defect(defect_id uuid, detail text, proof text) returns void
 language sql security invoker set search_path='' as $$
 select sst_private.sst_resolve_defect(defect_id,detail,proof)
$$;
revoke all on function public.sst_resolve_defect(uuid,text,text) from public,anon;
grant execute on function public.sst_resolve_defect(uuid,text,text) to authenticated;
-- Editors may configure their own recipient; readers cannot change delivery settings.
drop policy write_settings on public.sst_mail_settings;
create policy write_settings on public.sst_mail_settings for all to authenticated
 using(user_id=(select auth.uid()) and (select public.sst_can_edit()))
 with check(user_id=(select auth.uid()) and (select public.sst_can_edit()));
-- Derived on the server. Clients have no writable 'Apto' flag.
create view public.sst_vehicle_status with (security_invoker=true) as
 select v.id,v.user_id,
 case
  when exists(select 1 from public.sst_critical_defects d where d.vehicle_id=v.id and d.resolved_at is null)
   or exists(select 1 from jsonb_array_elements(coalesce(latest.payload->'items','[]'::jsonb)) i where i->>'status'='No conforme' and (i->>'id'=any(array['tires','brakes','lights','mirrors','belts','extinguisher','horn','fluids','steering','reverse']) or coalesce((i->>'critical')::boolean,false))) then 'No apto'
  when latest.id is null then 'Sin inspección'
  when exists(select 1 from jsonb_array_elements(latest.payload->'items') i where i->>'status'='No conforme') then 'Con observaciones'
  else 'Apto'
 end as aptitude
 from public.sst_vehicles v left join lateral (
  select d.id,d.payload from public.sst_documents d where d.kind='inspection' and d.payload->>'vehicleId'=v.id::text
  order by d.created_at desc,d.id desc limit 1
 ) latest on true;
revoke all on public.sst_vehicle_status from public,anon,authenticated;
grant select on public.sst_vehicle_status to authenticated;

-- Preserve corrections in the shared roster without changing its existing JSON data model.
create function sst_private.audit_workers() returns trigger language plpgsql security definer set search_path='' as $$
declare old_workers jsonb; new_workers jsonb; worker_id text; before_row jsonb; after_row jsonb;
begin
 if auth.uid() is not null and new.user_id<>auth.uid() then raise exception 'Propietario inválido'; end if;
 old_workers:=case when tg_op='UPDATE' then coalesce(old.payload->'workers','[]'::jsonb) else '[]'::jsonb end;
 new_workers:=coalesce(new.payload->'workers','[]'::jsonb);
 if old_workers=new_workers then return new; end if;
 for worker_id in select distinct x->>'id' from jsonb_array_elements(old_workers||new_workers) x loop
  select x into before_row from jsonb_array_elements(old_workers) x where x->>'id'=worker_id limit 1;
  select x into after_row from jsonb_array_elements(new_workers) x where x->>'id'=worker_id limit 1;
  if before_row is distinct from after_row then
   insert into public.sst_module_audit(user_id,entity,entity_id,before_data,after_data,actor)
   values(new.user_id,'worker',worker_id,before_row,coalesce(after_row,'null'::jsonb),coalesce(auth.jwt()->>'email',auth.uid()::text,'database-admin'));
  end if;
 end loop;
 return new;
end $$;
revoke all on function sst_private.audit_workers() from public,anon,authenticated;
create trigger sst_audit_workers after insert or update on public.sst_app_state for each row execute function sst_private.audit_workers();
commit;
