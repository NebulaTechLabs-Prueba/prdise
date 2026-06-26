-- ============================================================================
-- profiles: campos extras que el cliente edita en /account
-- ============================================================================
--
-- PM 2026-06-26: el dashboard del cliente (/account) tiene campos que vivían
-- SOLO en localStorage del navegador (pasaporte, alergias, restricciones
-- alimenticias, necesidades especiales, dirección de facturación, ID local,
-- notas especiales). El admin no podía verlos porque nunca llegaban a DB.
--
-- Esta migración los persiste como columnas opcionales. El admin los expone
-- en el modal de detalle del cliente.
-- ============================================================================

alter table public.profiles
  add column if not exists passport_number text,
  add column if not exists passport_expiry date,
  add column if not exists local_id text,
  add column if not exists billing_address text,
  add column if not exists allergies text,
  add column if not exists diet_restrictions text,
  add column if not exists special_needs text,
  add column if not exists special_notes text;

comment on column public.profiles.passport_number  is 'Número de pasaporte (cliente lo edita en /account).';
comment on column public.profiles.passport_expiry  is 'Fecha de vencimiento del pasaporte.';
comment on column public.profiles.local_id         is 'ID local / driver license / cédula.';
comment on column public.profiles.billing_address  is 'Dirección de facturación (texto libre).';
comment on column public.profiles.allergies        is 'Alergias del cliente (relevante para tours / food).';
comment on column public.profiles.diet_restrictions is 'Restricciones alimenticias (vegetariano, kosher, etc).';
comment on column public.profiles.special_needs    is 'Necesidades especiales de movilidad o acceso.';
comment on column public.profiles.special_notes    is 'Notas libres del cliente — el admin las ve al armar el viaje.';
