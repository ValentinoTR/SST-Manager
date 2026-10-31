-- Additive installation. Does not alter sst_app_state or its attachments.
begin;
create schema if not exists sst_private;
revoke all on schema sst_private from public, anon, authenticated;

create table public.sst_module_roles (
 user_id uuid primary key references auth.users(id),
 role text not null check (role in ('admin','editor','viewer'))
);
alter table public.sst_module_roles enable row level security;
grant select on public.sst_module_roles to authenticated;
create policy own_role on public.sst_module_roles for select to authenticated using (user_id=(select auth.uid()));
-- Existing accounts can create records; only an explicit admin can change mail settings.
create function public.sst_can_edit() returns boolean language sql stable security invoker set search_path='' as $$
 select auth.uid() is not null and coalesce((select role from public.sst_module_roles where user_id=auth.uid()),'editor') in ('admin','editor')
$$;
revoke all on function public.sst_can_edit() from public, anon;
grant execute on function public.sst_can_edit() to authenticated;

create table public.sst_vehicles (
 id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id),
 plate text not null check(plate ~ '^[A-Z0-9]{5,12}$'),
 type text not null check(length(trim(type)) between 1 and 120),
 brand text not null check(length(trim(brand)) between 1 and 120),
 model text not null check(length(trim(model)) between 1 and 120),
 revision integer not null default 1, created_at timestamptz not null default now(),
 unique(user_id,plate), unique(id,user_id)
);
create table public.sst_documents (
 id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id),
 kind text not null check(kind in ('inspection','talk')), revision integer not null default 1,
 payload jsonb not null, dedupe text not null, reason text not null default 'Registro inicial',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 actor text not null, unique(user_id,kind,dedupe), unique(id,user_id)
);
create table public.sst_document_versions (
 document_id uuid not null references public.sst_documents(id), user_id uuid not null references auth.users(id),
 revision integer not null, kind text not null, payload jsonb not null,
 reason text not null, actor text not null, recorded_at timestamptz not null default now(),
 primary key(document_id,revision)
);
create table public.sst_critical_defects (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 vehicle_id uuid not null references public.sst_vehicles(id), document_id uuid not null references public.sst_documents(id),
 item_id text not null, source_revision integer not null, note text not null, created_at timestamptz not null default now(),
 resolved_at timestamptz, resolution text, evidence text, resolved_by text,
 unique(document_id,source_revision,item_id)
);
create table public.sst_module_audit (
 id bigint generated always as identity primary key, user_id uuid not null references auth.users(id),
 entity text not null, entity_id text not null, before_data jsonb, after_data jsonb not null,
 actor text not null, recorded_at timestamptz not null default now()
);
create table public.sst_mail_settings (
 user_id uuid primary key default auth.uid() references auth.users(id),
 recipient text not null default 'seguridad@reliper.pe' check(recipient ~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
 sender text not null default 'educornejoperea28@gmail.com' check(sender='educornejoperea28@gmail.com')
);
create table public.sst_report_jobs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 document_id uuid not null, revision integer not null,
 recipient text not null, sender text not null,
 status text not null default 'pending' check(status in ('pending','processing','retry','sent','uncertain')),
 attempts integer not null default 0, available_at timestamptz not null default now(),
 locked_at timestamptz, pdf_path text, sent_at timestamptz, provider_id text, error text,
 unique(document_id,revision), foreign key(document_id,revision) references public.sst_document_versions(document_id,revision)
);
create index sst_documents_history on public.sst_documents(user_id,kind,updated_at desc);
create index sst_versions_owner on public.sst_document_versions(user_id,recorded_at desc);
create index sst_defects_open on public.sst_critical_defects(user_id,vehicle_id) where resolved_at is null;
create index sst_jobs_ready on public.sst_report_jobs(status,available_at);
create index sst_jobs_owner on public.sst_report_jobs(user_id);
create index sst_audit_owner on public.sst_module_audit(user_id,recorded_at desc);

-- All authorization is enforced on the server, with the same per-user isolation as the existing app.
do $$ declare t text; begin
 foreach t in array array['sst_vehicles','sst_documents','sst_document_versions','sst_critical_defects','sst_module_audit','sst_mail_settings','sst_report_jobs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy read_own on public.%I for select to authenticated using(user_id=(select auth.uid()))',t);
 end loop;
 foreach t in array array['sst_vehicles','sst_documents'] loop
  execute format('grant insert,update on public.%I to authenticated',t);
  execute format('create policy insert_own on public.%I for insert to authenticated with check(user_id=(select auth.uid()) and (select public.sst_can_edit()))',t);
  execute format('create policy update_own on public.%I for update to authenticated using(user_id=(select auth.uid()) and (select public.sst_can_edit())) with check(user_id=(select auth.uid()) and (select public.sst_can_edit()))',t);
 end loop;
end $$;
grant insert,update on public.sst_mail_settings to authenticated;
create policy write_settings on public.sst_mail_settings for all to authenticated
 using(user_id=(select auth.uid()) and exists(select 1 from public.sst_module_roles where user_id=(select auth.uid()) and role='admin'))
 with check(user_id=(select auth.uid()) and exists(select 1 from public.sst_module_roles where user_id=(select auth.uid()) and role='admin'));

create function sst_private.check_file(path text, owner_id uuid) returns boolean
 language sql stable security invoker set search_path='' as $$
 select path is null or (path like owner_id::text||'/%' and exists(select 1 from storage.objects where bucket_id='sst-safety' and name=path))
$$;

create function sst_private.validate_document() returns trigger language plpgsql security invoker set search_path='' as $$
declare p jsonb; i jsonb; person jsonb; required_id text; critical_ids text[]:=array['tires','brakes','lights','mirrors','belts','extinguisher','horn','fluids','steering','reverse']; v public.sst_vehicles; n integer;
begin
 if auth.uid() is null or new.user_id<>auth.uid() then raise exception 'Sesión o propietario inválido'; end if;
 if new.reason is null or length(new.reason)>2000 then raise exception 'Motivo inválido'; end if;
 if tg_op='UPDATE' then
  if (new.id,new.user_id,new.kind,new.created_at) is distinct from (old.id,old.user_id,old.kind,old.created_at) then raise exception 'Identidad inmutable'; end if;
  if new.revision<>old.revision+1 or length(trim(new.reason))<5 then raise exception 'Versión o motivo de corrección inválido'; end if;
 else
  new.revision:=1; new.created_at:=now();
 end if;
 new.updated_at:=now(); new.actor:=coalesce(auth.jwt()->>'email',auth.uid()::text);
 p:=new.payload;
 if pg_column_size(p)>200000 then raise exception 'Registro demasiado grande'; end if;
 if new.kind='inspection' then
  select * into v from public.sst_vehicles where id=(p->>'vehicleId')::uuid and user_id=new.user_id for update;
  if not found then raise exception 'Vehículo no disponible'; end if;
  if tg_op='UPDATE' and p->>'vehicleId'<>old.payload->>'vehicleId' then raise exception 'No se puede cambiar el vehículo del historial'; end if;
  if jsonb_typeof(p->'items') is distinct from 'array' or jsonb_array_length(p->'items')<>14 then raise exception 'Checklist incompleto'; end if;
  foreach required_id in array array['tires','brakes','lights','windows','mirrors','belts','extinguisher','horn','fluids','steering','reverse','wipers','firstaid','other'] loop
   select count(*) into n from jsonb_array_elements(p->'items') x where x->>'id'=required_id;
   if n<>1 then raise exception 'Componente faltante o duplicado: %',required_id; end if;
  end loop;
  for i in select * from jsonb_array_elements(p->'items') loop
   if coalesce(i->>'status','') not in ('Conforme','No conforme','No aplica') then raise exception 'Respuesta inválida'; end if;
   if i->>'status'<>'Conforme' and length(trim(coalesce(i->>'note','')))=0 then raise exception 'Falta observación o justificación'; end if;
   if i->>'id'=any(critical_ids) and i->>'status'='No aplica' then raise exception 'No aplica no permitido en componente crítico'; end if;
   if not sst_private.check_file(i->>'photo',new.user_id) then raise exception 'Fotografía no disponible'; end if;
  end loop;
  new.payload:=p||jsonb_build_object('vehicle',jsonb_build_object('plate',v.plate,'type',v.type,'brand',v.brand,'model',v.model));
  -- A request ID prevents double-click duplicates, while retaining distinct inspections.
  new.dedupe:=new.id::text;
 else
  foreach required_id in array array['date','time','topic','instructor','unit','area','content'] loop
   if length(trim(coalesce(p->>required_id,'')))=0 then raise exception 'Falta %',required_id; end if;
  end loop;
  perform (p->>'date')::date; perform (p->>'time')::time;
  if coalesce((p->>'duration')::integer,0) not between 5 and 480 then raise exception 'Duración inválida'; end if;
  if jsonb_typeof(p->'participants') is distinct from 'array' or jsonb_array_length(p->'participants')<1 then raise exception 'No hay convocados'; end if;
  if exists(select 1 from jsonb_array_elements(p->'participants') x group by x->>'dni' having count(*)>1) or exists(select 1 from jsonb_array_elements(p->'participants') x group by x->>'id' having count(*)>1) then raise exception 'Participantes duplicados'; end if;
  for person in select * from jsonb_array_elements(p->'participants') loop
   if coalesce(person->>'dni','') !~ '^\d{8}$' then raise exception 'DNI inválido'; end if;
   foreach required_id in array array['id','name','role','area'] loop
    if length(trim(coalesce(person->>required_id,'')))=0 then raise exception 'Datos incompletos del participante'; end if;
   end loop;
   if jsonb_typeof(person->'present') is distinct from 'boolean' then raise exception 'Asistencia inválida'; end if;
   if not (person->>'present')::boolean and (person->>'signature' is not null or length(coalesce(person->>'evidence',''))>0) then raise exception 'Ausente con evidencia'; end if;
   if coalesce((p->>'evidenceRequired')::boolean,false) and (person->>'present')::boolean and person->>'signature' is null and length(trim(coalesce(person->>'evidence','')))=0 then raise exception 'Falta evidencia individual'; end if;
   if not sst_private.check_file(person->>'signature',new.user_id) then raise exception 'Firma no disponible'; end if;
  end loop;
  if not sst_private.check_file(p->>'attachment',new.user_id) then raise exception 'Documento no disponible'; end if;
  new.dedupe:=lower(concat_ws('|',p->>'date',p->>'time',trim(p->>'topic'),trim(p->>'unit'),trim(p->>'area')));
 end if;
 return new;
end $$;
create trigger sst_validate_document before insert or update on public.sst_documents for each row execute function sst_private.validate_document();

-- Trigger-only definer: authenticated clients cannot write versions, jobs, audit or close defects.
create function sst_private.record_version() returns trigger language plpgsql security definer set search_path='' as $$
declare i jsonb; begin
 if auth.uid() is null or new.user_id<>auth.uid() then raise exception 'Sesión inválida'; end if;
 insert into public.sst_document_versions(document_id,user_id,revision,kind,payload,reason,actor)
 values(new.id,new.user_id,new.revision,new.kind,new.payload,new.reason,new.actor);
 if new.kind='inspection' then
  for i in select * from jsonb_array_elements(new.payload->'items') loop
   if i->>'status'='No conforme' and (i->>'id'=any(array['tires','brakes','lights','mirrors','belts','extinguisher','horn','fluids','steering','reverse']) or coalesce((i->>'critical')::boolean,false)) then
    insert into public.sst_critical_defects(user_id,vehicle_id,document_id,item_id,source_revision,note)
    select new.user_id,(new.payload->>'vehicleId')::uuid,new.id,i->>'id',new.revision,i->>'note'
    where not exists(select 1 from public.sst_critical_defects where document_id=new.id and item_id=i->>'id' and resolved_at is null);
   end if;
  end loop;
 end if;
 insert into public.sst_report_jobs(user_id,document_id,revision,recipient,sender)
 values(new.user_id,new.id,new.revision,coalesce((select recipient from public.sst_mail_settings where user_id=new.user_id),'seguridad@reliper.pe'),'educornejoperea28@gmail.com');
 return new;
end $$;
create trigger sst_record_version after insert or update on public.sst_documents for each row execute function sst_private.record_version();

create function sst_private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or new.user_id<>auth.uid() then raise exception 'Sesión inválida'; end if;
 if tg_table_name='sst_vehicles' and tg_op='UPDATE' then
  if (new.id,new.user_id,new.created_at) is distinct from (old.id,old.user_id,old.created_at) then raise exception 'Identidad inmutable'; end if;
  new.revision:=old.revision+1;
 end if;
 insert into public.sst_module_audit(user_id,entity,entity_id,before_data,after_data,actor)
 values(new.user_id,tg_table_name,coalesce(to_jsonb(new)->>'id',new.user_id::text),case when tg_op='UPDATE' then to_jsonb(old) end,to_jsonb(new),coalesce(auth.jwt()->>'email',auth.uid()::text));
 return new;
end $$;
create trigger sst_audit_vehicle before insert or update on public.sst_vehicles for each row execute function sst_private.audit_change();
create trigger sst_audit_settings before insert or update on public.sst_mail_settings for each row execute function sst_private.audit_change();

create function public.sst_save_document(doc_id uuid, doc_kind text, body jsonb, expected_revision integer, change_reason text)
 returns public.sst_documents language plpgsql security invoker set search_path='' as $$
declare result public.sst_documents; begin
 if expected_revision=0 then
  insert into public.sst_documents(id,kind,payload,dedupe,actor,reason) values(doc_id,doc_kind,body,doc_id::text,'',coalesce(change_reason,'Registro inicial')) returning * into result;
 else
  update public.sst_documents set payload=body,revision=expected_revision+1,reason=change_reason
  where id=doc_id and user_id=auth.uid() and kind=doc_kind and revision=expected_revision returning * into result;
  if not found then raise exception 'El registro cambió en otro dispositivo. Actualiza antes de corregir.'; end if;
 end if;
 return result;
end $$;
revoke all on function public.sst_save_document(uuid,text,jsonb,integer,text) from public,anon;
grant execute on function public.sst_save_document(uuid,text,jsonb,integer,text) to authenticated;

create function public.sst_resolve_defect(defect_id uuid, detail text, proof text) returns void
 language plpgsql security definer set search_path='' as $$
declare d public.sst_critical_defects; before_row jsonb; begin
 if auth.uid() is null or not public.sst_can_edit() then raise exception 'Sin permiso'; end if;
 select * into d from public.sst_critical_defects where id=defect_id and user_id=auth.uid() for update;
 if not found or d.resolved_at is not null then raise exception 'Falla no disponible o ya resuelta'; end if;
 if length(trim(detail))<10 or proof is null or not sst_private.check_file(proof,auth.uid()) then raise exception 'Detalla el levantamiento y adjunta evidencia'; end if;
 -- Same lock as inspection saves: cannot clear the block in a racing transaction.
 perform 1 from public.sst_vehicles where id=d.vehicle_id for update;
 before_row:=to_jsonb(d);
 update public.sst_critical_defects set resolved_at=now(),resolution=detail,evidence=proof,resolved_by=coalesce(auth.jwt()->>'email',auth.uid()::text) where id=d.id returning * into d;
 insert into public.sst_module_audit(user_id,entity,entity_id,before_data,after_data,actor) values(auth.uid(),'sst_critical_defects',d.id::text,before_row,to_jsonb(d),d.resolved_by);
end $$;
revoke all on function public.sst_resolve_defect(uuid,text,text) from public,anon;
grant execute on function public.sst_resolve_defect(uuid,text,text) to authenticated;

-- Atomic worker claim, restricted to service_role. Stale sends require reconciliation to avoid duplicate email.
create function public.sst_claim_report(owner_filter uuid default null) returns setof public.sst_report_jobs
 language plpgsql security invoker set search_path='' as $$
begin
 update public.sst_report_jobs set status='uncertain',error='Ejecución interrumpida; verificar en Gmail antes de reenviar.' where status='processing' and locked_at<now()-interval '10 minutes' and (owner_filter is null or user_id=owner_filter);
 return query with candidate as (
  select id from public.sst_report_jobs where status in ('pending','retry') and available_at<=now() and (owner_filter is null or user_id=owner_filter)
  order by available_at for update skip locked limit 1
 ) update public.sst_report_jobs j set status='processing',attempts=attempts+1,locked_at=now() from candidate c where j.id=c.id returning j.*;
end $$;
revoke all on function public.sst_claim_report(uuid) from public,anon,authenticated;
grant execute on function public.sst_claim_report(uuid) to service_role;
grant select,insert,update on public.sst_report_jobs to service_role;
grant select on public.sst_document_versions,public.sst_documents,public.sst_critical_defects,public.sst_mail_settings to service_role;

-- Private immutable evidence, separate from the existing bucket's deletion/restore workflows.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('sst-safety','sst-safety',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf']);
create policy safety_read on storage.objects for select to authenticated using(bucket_id='sst-safety' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy safety_insert on storage.objects for insert to authenticated with check(bucket_id='sst-safety' and (storage.foldername(name))[1]=(select auth.uid())::text and (select public.sst_can_edit()) and (storage.foldername(name))[2]='evidence');
-- No client UPDATE/DELETE; history evidence cannot be replaced or removed.
revoke all on all functions in schema sst_private from public,anon,authenticated;
-- Invoker triggers need the internal schema, but no internal definer is executable by clients.
grant usage on schema sst_private to authenticated;
grant execute on function sst_private.check_file(text,uuid) to authenticated;
commit;
