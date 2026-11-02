-- Additive: original documents, evidence, versions, grants and roles are preserved.
begin;
create function sst_private.validate_reliper() returns trigger
 language plpgsql security invoker set search_path='' as $$
declare r jsonb; c jsonb; i jsonb; b jsonb; children jsonb; normalized jsonb:='[]';
 aggregates jsonb:='[]'; k text; n integer; stop boolean:=false; critical boolean; status text; note text; photo text;
 catalog jsonb:=/*catalog*/'[{"id":"g01","group":0,"label":"Faros principales / faros neblineros / luces pirata","color":"yellow","legacy":"lights","critical":true},{"id":"g02","group":0,"label":"Luces direccionales / de estacionamiento / intermitentes","color":"yellow","legacy":"lights","critical":true},{"id":"g03","group":0,"label":"Luces de freno / luces de retroceso","color":"yellow","legacy":"lights","critical":true},{"id":"g04","group":0,"label":"Luz estroboscópica","color":"yellow","legacy":"lights","critical":true},{"id":"g05","group":0,"label":"Espejos","color":"yellow","legacy":"mirrors","critical":true},{"id":"g06","group":0,"label":"Parabrisas y ventanas (sin rajaduras)","color":"yellow","legacy":"windows","critical":false},{"id":"g07","group":0,"label":"Plumillas / lavaparabrisas","color":"yellow","legacy":"wipers","critical":false},{"id":"g08","group":0,"label":"Neumáticos de las mismas características, incluido repuesto (tipo AT / MT, presión y banda de rodamiento)","color":"red","legacy":"tires","critical":true},{"id":"g09","group":0,"label":"Espárragos, tuercas (torque según fabricante), seguro de tuercas o indicadores tipo gota","color":"yellow","legacy":"tires","critical":true},{"id":"g10","group":0,"label":"Cartolas / letreros identificatorios","color":"green","legacy":"other","critical":false},{"id":"i01","group":1,"label":"Cinturones de seguridad","color":"red","legacy":"belts","critical":true},{"id":"i02","group":1,"label":"Alarma de retroceso","color":"red","legacy":"reverse","critical":true},{"id":"i03","group":1,"label":"Seguros de puertas","color":"yellow","legacy":"other","critical":false},{"id":"i04","group":1,"label":"Claxon","color":"red","legacy":"horn","critical":true},{"id":"i05","group":1,"label":"Tarjeta de propiedad, póliza de seguro, SOAT y revisión técnica vigente","color":"red","legacy":"other","critical":true},{"id":"i06","group":1,"label":"Kit básico de herramientas / llave de rueda","color":"green","legacy":"firstaid","critical":false},{"id":"i07","group":1,"label":"Gata (doble peso bruto vehicular) y sus accesorios","color":"green","legacy":"firstaid","critical":false},{"id":"i08","group":1,"label":"Orden y limpieza","color":"green","legacy":"other","critical":false},{"id":"i09","group":1,"label":"Aire acondicionado","color":"yellow","legacy":"other","critical":false},{"id":"s01","group":2,"label":"Tacos / cuñas (02)","color":"green","legacy":"firstaid","critical":false},{"id":"s02","group":2,"label":"Conos de seguridad de 70 cm (03), con cinta reflectiva (8-10 cm)","color":"green","legacy":"firstaid","critical":false},{"id":"s03","group":2,"label":"Eslinga / grilletes","color":"green","legacy":"other","critical":false},{"id":"s04","group":2,"label":"Pico y pala","color":"green","legacy":"firstaid","critical":false},{"id":"s05","group":2,"label":"Cable para pasar corriente","color":"green","legacy":"firstaid","critical":false},{"id":"s06","group":2,"label":"Extintor PQS 6 kg (ABC)","color":"green","legacy":"extinguisher","critical":true},{"id":"s07","group":2,"label":"Botiquín / linterna","color":"green","legacy":"firstaid","critical":false},{"id":"s08","group":2,"label":"Kit antiderrame","color":"green","legacy":"firstaid","critical":false},{"id":"s09","group":2,"label":"Sistema de comunicación (teléfono satelital, radio handy, celular)","color":"green","legacy":"other","critical":false},{"id":"s10","group":2,"label":"Otros elementos de seguridad","color":"green","legacy":"other","critical":false},{"id":"m01","group":3,"label":"Estado de los frenos de servicio","color":"red","legacy":"brakes","critical":true},{"id":"m02","group":3,"label":"Freno de estacionamiento","color":"red","legacy":"brakes","critical":true},{"id":"m03","group":3,"label":"Dirección","color":"red","legacy":"steering","critical":true},{"id":"m04","group":3,"label":"Nivel de aceite del motor","color":"red","legacy":"fluids","critical":true},{"id":"m05","group":3,"label":"Nivel de líquido de frenos","color":"red","legacy":"fluids","critical":true},{"id":"m06","group":3,"label":"Nivel de refrigerante","color":"red","legacy":"fluids","critical":true},{"id":"m07","group":3,"label":"Nivel de aceite hidráulico (hidrolina)","color":"red","legacy":"fluids","critical":true},{"id":"m08","group":3,"label":"Nivel de agua para limpiaparabrisas","color":"green","legacy":"wipers","critical":false},{"id":"m09","group":3,"label":"Otros componentes mecánicos (1)","color":"green","legacy":"other","critical":false},{"id":"m10","group":3,"label":"Otros componentes mecánicos (2)","color":"green","legacy":"other","critical":false}]'/*endcatalog*/::jsonb;
 legacy jsonb:=/*legacy*/'[{"id":"tires","label":"Llantas y ruedas","critical":true},{"id":"brakes","label":"Frenos de servicio y estacionamiento","critical":true},{"id":"lights","label":"Luces y señalización","critical":true},{"id":"windows","label":"Ventanas y parabrisas","critical":false},{"id":"mirrors","label":"Espejos","critical":true},{"id":"belts","label":"Cinturones de seguridad","critical":true},{"id":"extinguisher","label":"Extintor: carga y vigencia","critical":true},{"id":"horn","label":"Bocina","critical":true},{"id":"fluids","label":"Niveles de fluidos y fugas","critical":true},{"id":"steering","label":"Dirección","critical":true},{"id":"reverse","label":"Alarma de retroceso","critical":true},{"id":"wipers","label":"Limpiaparabrisas","critical":false},{"id":"firstaid","label":"Botiquín, triángulos y herramientas","critical":false},{"id":"other","label":"Otros componentes","critical":false}]'/*endlegacy*/::jsonb;
begin
 if new.kind<>'inspection' then return new; end if;
 if tg_op='UPDATE' and coalesce(new.payload->>'template','legacy')<>coalesce(old.payload->>'template','legacy') then raise exception 'El formato de un registro existente no se puede reemplazar'; end if;
 if coalesce(new.payload->>'template','legacy')='legacy' then return new; end if;
 if new.payload->>'template'<>'reliper-light-v1' then raise exception 'Formato de inspección no reconocido'; end if;
 if auth.uid() is null or new.user_id<>auth.uid() then raise exception 'Sesión inválida'; end if;
 r:=new.payload->'reliper';
 if jsonb_typeof(r) is distinct from 'object' then raise exception 'Faltan datos RELIPER'; end if;
 foreach k in array array['driver','company','date','time'] loop
  if jsonb_typeof(r->k) is distinct from 'string' or length(trim(r->>k))=0 or length(r->>k)>250 then raise exception 'Dato RELIPER inválido: %',k; end if;
 end loop;
 perform (r->>'date')::date; perform (r->>'time')::time;
 if length(coalesce(r->>'approvalDate',''))>0 then perform (r->>'approvalDate')::date; end if;
 foreach k in array array['mileage','nextMaintenance'] loop
  if jsonb_typeof(r->k) is distinct from 'number' or (r->>k)::numeric not between 0 and 99999999 then raise exception 'Kilometraje inválido'; end if;
 end loop;
 if jsonb_typeof(r->'fuel') is distinct from 'number' or r->>'fuel' not in ('0','25','50','75','100') then raise exception 'Combustible inválido'; end if;
 if jsonb_typeof(r->'fatigue') is distinct from 'array' or jsonb_array_length(r->'fatigue')<>11 then raise exception 'Responde las 11 preguntas de fatiga'; end if;
 for i,n in select value,ordinality from jsonb_array_elements(r->'fatigue') with ordinality loop
  if jsonb_typeof(i) is distinct from 'boolean' then raise exception 'Respuesta de fatiga inválida'; end if;
  stop:=stop or (case when n<=5 then not i::boolean else i::boolean end);
 end loop;
 if jsonb_typeof(r->'components') is distinct from 'array' or jsonb_array_length(r->'components')<>39 then raise exception 'Checklist RELIPER incompleto'; end if;
 for c in select value from jsonb_array_elements(catalog) loop
  select count(*) into n from jsonb_array_elements(r->'components') x where x->>'id'=c->>'id';
  if n<>1 then raise exception 'Componente RELIPER faltante o duplicado'; end if;
  select x into i from jsonb_array_elements(r->'components') x where x->>'id'=c->>'id';
  if coalesce(i->>'status','') not in ('Conforme','No conforme','No aplica') then raise exception 'Respuesta RELIPER inválida'; end if;
  if i->>'status'<>'Conforme' and length(trim(coalesce(i->>'note','')))=0 then raise exception 'Falta observación RELIPER'; end if;
  if i?'critical' and jsonb_typeof(i->'critical') is distinct from 'boolean' then raise exception 'Indicador crítico inválido'; end if;
  critical:=(c->>'critical')::boolean or coalesce((i->>'critical')::boolean,false);
  if critical and i->>'status'='No aplica' then raise exception 'No aplica no permitido en componente crítico'; end if;
  if length(coalesce(i->>'note',''))>3000 then raise exception 'Observación demasiado extensa'; end if;
  if not sst_private.check_file(i->>'photo',new.user_id) then raise exception 'Fotografía RELIPER no disponible'; end if;
  normalized:=normalized||jsonb_build_array(i||c||jsonb_build_object('critical',critical));
 end loop;
 foreach k in array array['driverSignature','supervisorSignature'] loop
  if not sst_private.check_file(r->>k,new.user_id) then raise exception 'Firma RELIPER no disponible'; end if;
 end loop;
 if r->>'supervisorSignature' is not null and length(trim(coalesce(r->>'supervisor','')))=0 then raise exception 'Identifica al supervisor que firma'; end if;
 if jsonb_typeof(r->'pauses') is distinct from 'array' or jsonb_array_length(r->'pauses')>6 then raise exception 'Pausas inválidas'; end if;
 for i in select value from jsonb_array_elements(r->'pauses') loop
  if length(trim(coalesce(i->>'route','')))=0 or coalesce(i->>'minutes','') !~ '^\d+$' or (i->>'minutes')::integer not between 5 and 480 then raise exception 'Pausa: ruta y mínimo 5 minutos requeridos'; end if;
  if coalesce(i->>'time','') !~ '^\d{2}:\d{2}$' then raise exception 'Hora de pausa inválida'; end if;
  perform (i->>'time')::time;
 end loop;
 for b in select value from jsonb_array_elements(legacy) loop
  select jsonb_agg(x) into children from jsonb_array_elements(normalized) x where x->>'legacy'=b->>'id';
  if exists(select 1 from jsonb_array_elements(children) x where x->>'status'='No conforme') then status:='No conforme';
  elsif not exists(select 1 from jsonb_array_elements(children) x where x->>'status'<>'No aplica') then status:='No aplica'; else status:='Conforme'; end if;
  critical:=(b->>'critical')::boolean or exists(select 1 from jsonb_array_elements(children) x where x->>'status'='No conforme' and (x->>'critical')::boolean);
  select coalesce(string_agg((x->>'label')||': '||coalesce(x->>'note',''),E'\n'),'') into note from jsonb_array_elements(children) x where x->>'status'<>'Conforme';
  if length(note)>1500 then note:=left(note,1400)||E'\n[Resumen. Consulta el detalle completo en la inspección RELIPER.]'; end if;
  select x->>'photo' into photo from jsonb_array_elements(children) x where x->>'photo' is not null limit 1;
  aggregates:=aggregates||jsonb_build_array(b||jsonb_build_object('status',status,'critical',critical,'note',note,'photo',photo));
 end loop;
 r:=r||jsonb_build_object('components',normalized,'fatigueStop',stop);
 new.payload:=new.payload||jsonb_build_object('reliper',r,'items',aggregates);
 return new;
end $$;
revoke all on function sst_private.validate_reliper() from public,anon,authenticated;
-- PostgreSQL executes BEFORE triggers in name order: canonicalize before the existing validator.
create trigger sst_00_reliper_document before insert or update on public.sst_documents
 for each row execute function sst_private.validate_reliper();
create or replace view public.sst_vehicle_status with (security_invoker=true) as
 select v.id,v.user_id,
 case
  when exists(select 1 from public.sst_critical_defects d where d.vehicle_id=v.id and d.resolved_at is null)
   or exists(select 1 from jsonb_array_elements(coalesce(latest.payload->'items','[]'::jsonb)) i where i->>'status'='No conforme' and (i->>'id'=any(array['tires','brakes','lights','mirrors','belts','extinguisher','horn','fluids','steering','reverse']) or coalesce((i->>'critical')::boolean,false)))
   or (latest.payload->>'template'='reliper-light-v1' and coalesce((latest.payload->'reliper'->>'fatigueStop')::boolean,false)) then 'No apto'
  when latest.id is null then 'Sin inspección'
  when exists(select 1 from jsonb_array_elements(latest.payload->'items') i where i->>'status'='No conforme') then 'Con observaciones'
  else 'Apto'
 end as aptitude
 from public.sst_vehicles v left join lateral (
  select d.id,d.payload from public.sst_documents d where d.kind='inspection' and d.payload->>'vehicleId'=v.id::text
  order by d.created_at desc,d.id desc limit 1
 ) latest on true;
create function public.sst_reliper_ready() returns boolean language sql stable security invoker set search_path='' as $$select true$$;
revoke all on function public.sst_reliper_ready() from public,anon;
grant execute on function public.sst_reliper_ready() to authenticated,service_role;
commit;
