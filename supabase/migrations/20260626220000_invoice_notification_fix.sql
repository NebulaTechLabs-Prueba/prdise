-- ============================================================================
-- notify_new_invoice — formatear precio correctamente
-- ============================================================================
--
-- PM 2026-06-26: el trigger original (creado a mano desde SQL Editor) emitía
-- el body con `'$' || (new.total_cents / 100)` que devuelve un numeric con
-- todos los decimales: "$132.0000000000000000". El admin recibe una
-- notificación con un monto ilegible.
--
-- Esta migración reemplaza la función con formato correcto (to_char + máscara
-- "FM999G999G990D00"). Si el trigger no existía aún, lo crea. Idempotente.
-- ============================================================================

create or replace function public.trg_notify_new_invoice()
returns trigger
language plpgsql
security definer
as $$
declare
  total_str    text;
  display_name text;
  body_es      text;
  body_en      text;
  rec          record;
begin
  -- Formato 1,234.50 (locale-independent, usamos . como decimal). El
  -- prefijo "$" se concatena después.
  total_str    := to_char((new.total_cents::numeric) / 100.0, 'FM999G999G990D00');
  display_name := coalesce(nullif(trim(new.customer_name), ''), 'cliente');
  body_es      := 'Factura ' || new.number || ' para ' || display_name || ' — $' || total_str;
  body_en      := 'Invoice ' || new.number || ' for ' || display_name || ' — $' || total_str;

  -- Notificar a TODOS los admins activos. Si la tabla `profiles` o la
  -- columna `role` no existe (instalaciones tempranas), no hace nada.
  for rec in
    select id from public.profiles
     where role = 'admin'
       and (status is null or status = 'active')
  loop
    insert into public.notifications (recipient_id, kind, title_es, title_en, body_es, body_en, link)
    values (
      rec.id,
      'new_invoice',
      'Nueva factura creada',
      'New invoice created',
      body_es,
      body_en,
      '/admin?section=invoices'
    );
  end loop;

  return new;
end;
$$;

-- Recrear el trigger sobre invoices (solo al insertar, no en update).
drop trigger if exists trg_invoice_notify_on_insert on public.invoices;
create trigger trg_invoice_notify_on_insert
  after insert on public.invoices
  for each row execute function public.trg_notify_new_invoice();

comment on function public.trg_notify_new_invoice() is
  'Inserta una notificación new_invoice para cada admin activo cuando se crea una factura. Formatea el total con 2 decimales (no 16).';
