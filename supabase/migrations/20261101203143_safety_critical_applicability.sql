begin;

-- Additive validation for future writes. Existing documents and immutable
-- revisions are not rewritten. RELIPER canonicalization runs first (sst_00_*).
-- Both legacy and RELIPER records already describe additional IPERC controls
-- as critical; those controls require verification just like the base catalog.
create function sst_private.validate_critical_applicability()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
 if new.kind = 'inspection' and jsonb_typeof(new.payload->'items') = 'array' then
  if exists (
     select 1 from jsonb_array_elements(new.payload->'items') item
     where item ? 'critical' and jsonb_typeof(item->'critical') not in ('boolean','null')
  ) then
   raise exception 'Indicador crítico inválido: utiliza verdadero o falso';
  end if;
  if exists (
     select 1
     from jsonb_array_elements(new.payload->'items') item
     where item->'critical' = 'true'::jsonb
       and item->>'status' = 'No aplica'
  ) then
   raise exception 'Los componentes críticos adicionales requieren verificación; No aplica no está permitido';
  end if;
 end if;
 return new;
end;
$$;

revoke all on function sst_private.validate_critical_applicability() from public, anon, authenticated;
create trigger sst_01_critical_applicability
 before insert or update on public.sst_documents
 for each row execute function sst_private.validate_critical_applicability();

commit;
