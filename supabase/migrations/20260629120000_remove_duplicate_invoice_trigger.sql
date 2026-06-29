-- ============================================================================
-- Eliminar triggers duplicados de invoices (después de aplicar el fix de
-- formato del precio)
-- ============================================================================
--
-- PM 2026-06-29: el cliente reportó 2 notificaciones por cada factura
-- creada. Una con $0.50 (formato nuevo, trigger correcto) y otra con
-- $0.500000000000000000 (formato viejo, trigger preexistente).
--
-- Esta migración:
--   1. Lista y dropea cualquier trigger AFTER INSERT en `invoices` que
--      no sea `trg_invoice_notify_on_insert` (el nuestro).
--   2. Limpia notificaciones históricas con el formato malo.
-- ============================================================================

-- 1. Eliminar cualquier trigger duplicado en invoices que dispare al INSERT.
do $$
declare
  r record;
begin
  for r in
    select trigger_name
      from information_schema.triggers
     where event_object_schema = 'public'
       and event_object_table = 'invoices'
       and event_manipulation = 'INSERT'
       and trigger_name <> 'trg_invoice_notify_on_insert'
  loop
    raise notice 'Dropeando trigger duplicado: %', r.trigger_name;
    execute format('drop trigger if exists %I on public.invoices', r.trigger_name);
  end loop;
end $$;

-- 2. Borrar notificaciones históricas con el formato malo (más de 2 decimales
--    o ceros excesivos). El cliente las puede regenerar abriendo el bell.
delete from public.notifications
 where kind = 'new_invoice'
   and (body_es ~ '\.\d{3,}' or body_en ~ '\.\d{3,}');
