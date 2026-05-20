-- ============================================================================
-- 0004 — Extiende profiles con campos provenientes de OAuth providers (Google)
--        y reemplaza tg_handle_new_user para extraer datos del provider.
-- ============================================================================
--
-- Contexto:
--   El trigger original tg_handle_new_user solo leía 'first_name' y 'last_name'
--   del raw_user_meta_data. Eso funciona para signup por email, pero Google
--   OAuth entrega el payload con otras claves: given_name, family_name, picture,
--   locale, sub. Esta migración:
--     1) agrega columnas para guardar avatar, provider y provider_sub
--     2) reescribe el trigger para mapear correctamente Google → profiles
--
-- Nota: email_verified NO se duplica aquí — se lee de auth.users.email_confirmed_at.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 1. Columnas nuevas
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column avatar_url   text,
  add column provider     text not null default 'email',
  add column provider_sub text;

comment on column public.profiles.avatar_url is
  'URL del avatar del usuario. Para signup por Google viene de raw_user_meta_data->>''picture''. Null si el usuario se registró por email y no subió foto.';

comment on column public.profiles.provider is
  'Proveedor de auth usado en el signup: ''email'', ''google'', etc. Se setea desde auth.users.app_metadata->>''provider'' en el trigger. Default ''email''.';

comment on column public.profiles.provider_sub is
  'Identificador único del usuario en el provider externo (ej. Google ''sub'' claim). Útil para auditoría y para detectar cuentas duplicadas entre providers. Null para signup por email.';

-- ----------------------------------------------------------------------------
-- 2. Índice para lookups por (provider, provider_sub)
-- ----------------------------------------------------------------------------
-- Permite encontrar rápidamente el profile asociado a un sub específico de
-- un provider determinado. No es UNIQUE porque históricamente puede haber
-- providers sin sub (email) y queremos evitar conflictos con NULL.
create index profiles_provider_sub_idx
  on public.profiles(provider, provider_sub)
  where provider_sub is not null;

-- ----------------------------------------------------------------------------
-- 3. Reemplazo de tg_handle_new_user
-- ----------------------------------------------------------------------------
-- Diferencias vs el trigger original:
--   - Lee app_metadata->>'provider' para saber si vino de Google.
--   - Si es Google: extrae given_name, family_name, picture, locale, sub.
--   - Si es email: mantiene comportamiento previo (first_name, last_name).
--   - Mapea locale → lang_pref si es 'es' o 'en' (default 'es').
--   - on conflict (id) do update: si el profile ya existía (ej. el usuario
--     se registró antes por email y ahora vincula Google), updateamos los
--     campos que estén vacíos en lugar de descartar el insert.
-- ----------------------------------------------------------------------------
create or replace function public.tg_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider     text;
  v_first_name   text;
  v_last_name    text;
  v_avatar_url   text;
  v_provider_sub text;
  v_locale       text;
  v_lang_pref    public.language_code;
begin
  -- Provider efectivo: app_metadata->>'provider' lo setea Supabase Auth.
  -- Para signup por email es 'email'; para Google es 'google'.
  v_provider := coalesce(new.raw_app_meta_data->>'provider', 'email');

  -- Campos específicos del provider.
  if v_provider = 'google' then
    v_first_name   := new.raw_user_meta_data->>'given_name';
    v_last_name    := new.raw_user_meta_data->>'family_name';
    v_avatar_url   := new.raw_user_meta_data->>'picture';
    v_provider_sub := new.raw_user_meta_data->>'sub';
    v_locale       := new.raw_user_meta_data->>'locale';
  else
    -- Signup por email: el front mete first_name/last_name en raw_user_meta_data.
    v_first_name   := new.raw_user_meta_data->>'first_name';
    v_last_name    := new.raw_user_meta_data->>'last_name';
    v_avatar_url   := null;
    v_provider_sub := null;
    v_locale       := new.raw_user_meta_data->>'locale';
  end if;

  -- Mapeo de locale → lang_pref. Google manda 'es', 'en', 'es-PR', 'en-US', etc.
  -- Solo aceptamos 'es' o 'en'; cualquier otra cosa cae a 'es'.
  if v_locale is not null and lower(left(v_locale, 2)) in ('es', 'en') then
    v_lang_pref := lower(left(v_locale, 2))::public.language_code;
  else
    v_lang_pref := 'es'::public.language_code;
  end if;

  insert into public.profiles (
    id,
    first_name,
    last_name,
    avatar_url,
    provider,
    provider_sub,
    lang_pref
  )
  values (
    new.id,
    v_first_name,
    v_last_name,
    v_avatar_url,
    v_provider,
    v_provider_sub,
    v_lang_pref
  )
  on conflict (id) do update set
    -- Solo rellenamos campos que están vacíos en el row existente. Esto cubre
    -- el caso "el usuario se registró por email y ahora vincula Google" sin
    -- pisar datos que el usuario ya editó.
    first_name   = coalesce(public.profiles.first_name,   excluded.first_name),
    last_name    = coalesce(public.profiles.last_name,    excluded.last_name),
    avatar_url   = coalesce(public.profiles.avatar_url,   excluded.avatar_url),
    provider_sub = coalesce(public.profiles.provider_sub, excluded.provider_sub),
    -- provider sí lo actualizamos: representa el último provider usado para
    -- crear/vincular esta identidad. Útil para analytics.
    provider     = excluded.provider,
    updated_at   = now();

  return new;
end;
$$;

-- El trigger on_auth_user_created ya existe apuntando a esta función,
-- así que basta con haber reemplazado el cuerpo con create or replace.
