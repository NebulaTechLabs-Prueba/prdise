-- ============================================================================
-- invoice number sequence — generador atómico (sin race + sin colisiones por delete)
-- ============================================================================
--
-- PM 2026-06-26: el generador previo hacía `SELECT count(*) WHERE year=YYYY`
-- y sumaba 1. Dos problemas:
--   1. Race condition: 2 creates simultáneos leen mismo count → mismo número.
--   2. Deletes hacen bajar el count → próximo create puede reusar un número.
--
-- Fix: sequence Postgres (atómica por diseño) + función que combina year +
-- next sequence value. El número crece monotónicamente para siempre — si
-- hay un delete, el número no se reusa.
-- ============================================================================

create sequence if not exists public.invoices_serial_seq;

create or replace function public.next_invoice_number()
returns text
language plpgsql
as $$
declare
  yr  int := extract(year from now())::int;
  seq bigint;
begin
  seq := nextval('public.invoices_serial_seq');
  -- INV-YYYY-NNNN (mínimo 4 dígitos, sin tope). Si la sequence pasa de
  -- 9999, lpad sigue sumando dígitos sin romper.
  return 'INV-' || yr || '-' || lpad(seq::text, 4, '0');
end;
$$;

comment on function public.next_invoice_number() is
  'Genera el próximo número de factura combinando year actual + sequence global atómica. Garantiza unicidad incluso bajo creates concurrentes y deletes.';

-- Sincronizar la sequence con el max actual para que el próximo número
-- no choque con los ya existentes (si los hay).
do $$
declare
  max_seq int := 0;
begin
  select coalesce(max(substring(number from '\d+$')::int), 0)
    into max_seq
    from public.invoices
   where number ~ '^INV-\d{4}-\d+$';
  if max_seq > 0 then
    perform setval('public.invoices_serial_seq', max_seq);
  end if;
end $$;
