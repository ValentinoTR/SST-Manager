-- Run in SQL Editor. Every synthetic record is rolled back; no report becomes visible to the scheduler.
begin;
do $$
declare account_id uuid; account_email text; vehicle_id uuid:=gen_random_uuid(); doc_id uuid:=gen_random_uuid(); payload jsonb; outcome text; old_count bigint; new_count bigint;
begin
 select id,email into account_id,account_email from auth.users u where not exists(select 1 from public.sst_module_roles r where r.user_id=u.id and r.role='viewer') limit 1;
 if account_id is null then raise exception 'No hay cuenta editora para verificación transaccional'; end if;
 select count(*) into old_count from public.sst_app_state;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',account_id::text,'email',account_email,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',account_id::text,true);
 execute 'set local role authenticated';
 insert into public.sst_vehicles(id,plate,type,brand,model) values(vehicle_id,'QA'||upper(substr(replace(vehicle_id::text,'-',''),1,8)),'Prueba sin guardar','Prueba','Prueba');
 select jsonb_build_object('vehicleId',vehicle_id,'items',jsonb_agg(jsonb_build_object('id',item,'label',item,'status',case when item='brakes' then 'No conforme' else 'Conforme' end,'note',case when item='brakes' then 'Falla ficticia para prueba transaccional' else '' end,'critical',false))) into payload
 from unnest(array['tires','brakes','lights','windows','mirrors','belts','extinguisher','horn','fluids','steering','reverse','wipers','firstaid','other']) item;
 perform public.sst_save_document(doc_id,'inspection',payload,0,'Prueba transaccional');
 select aptitude into outcome from public.sst_vehicle_status where id=vehicle_id;
 if outcome<>'No apto' then raise exception 'No se bloqueó falla crítica'; end if;
 if not exists(select 1 from public.sst_report_jobs where document_id=doc_id and status='pending') then raise exception 'No se encoló reporte'; end if;
 if not exists(select 1 from public.sst_document_versions where document_id=doc_id and revision=1) then raise exception 'Falta versión'; end if;
 select jsonb_set(payload,'{items}',(select jsonb_agg(x||jsonb_build_object('status','Conforme')) from jsonb_array_elements(payload->'items') x)) into payload;
 perform public.sst_save_document(doc_id,'inspection',payload,1,'Corrección ficticia de prueba');
 select aptitude into outcome from public.sst_vehicle_status where id=vehicle_id;
 if outcome<>'No apto' then raise exception 'La corrección liberó una falla pendiente'; end if;
 execute 'reset role';
 select count(*) into new_count from public.sst_app_state;
 if old_count<>new_count then raise exception 'Se alteraron registros anteriores'; end if;
end $$;
select 'Verificación real superada: bloqueo crítico, versiones, cola y conservación del estado anterior' as result;
rollback;
