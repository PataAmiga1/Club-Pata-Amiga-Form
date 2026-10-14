-- Bajas de correo («lista negra») y audiencia del boletín.
-- Contexto: juntas/104 (13-oct-2026) y la petición de la PM: «crear un flujo en
-- el cual los tengamos en un CRM de blacklist para que ya no se le esté
-- mandando nada».
--
-- Quien se da de baja deja de recibir el boletín Y cualquier correo masivo o de
-- mercadotecnia (la tanda, campañas). Los correos de SERVICIO de su cuenta
-- —cobros, reintegros, avisos legales— le siguen llegando: esos no son
-- mercadotecnia y dejarlos de mandar le haría daño a la persona.
--
-- DISEÑO DEL TOKEN: un uuid aleatorio POR CORREO, guardado aquí. Se eligió
-- sobre un HMAC derivado de la llave de servicio porque:
--   · no hay secreto que repartir: el kit de Python pide el token a la base con
--     la misma llave con la que ya lee, sin reimplementar ningún algoritmo;
--   · rotar la llave de servicio de Supabase NO rompe las ligas ya enviadas
--     (con HMAC, todas las ligas viejas morirían el día de la rotación);
--   · un token se puede invalidar uno por uno si se filtra;
--   · es estable: el mismo correo siempre tiene la misma liga, así que una
--     liga de un correo de hace meses sigue funcionando.
-- El token no dice nada del correo (122 bits aleatorios) y la tabla no tiene
-- políticas RLS: solo la llave de servicio la lee o la escribe.

-- ------------------------------------------------------------ la tabla -----

create table if not exists correo_bajas (
  -- Normalizado: minúsculas y sin espacios. Es la identidad de la persona para
  -- efectos de correo, tenga o no cuenta o contacto en el CRM.
  email         text primary key check (email = lower(btrim(email)) and email like '%_@_%'),
  -- La liga de baja. Existe ANTES de la baja: se emite al mandar el correo.
  token         uuid not null unique default gen_random_uuid(),
  -- null = nunca se dio de baja (o se revirtió). Con fecha = está en la lista negra.
  baja_at       timestamptz,
  -- Cómo llegó a la lista negra.
  origen        text check (origen in (
                  'pagina',       -- botón de la página /baja/<token>
                  'un_clic',      -- botón «darse de baja» del cliente de correo (RFC 8058)
                  'queja_spam',   -- la persona marcó el boletín como spam (webhook de Resend)
                  'equipo'        -- la puso el equipo a mano
                )),
  -- Contacto del CRM al que se le puso el «no contactar por correo», si existía.
  contact_id    uuid references contacts(id) on delete set null,
  revertida_at  timestamptz,
  revertida_por uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_correo_bajas_activas
  on correo_bajas(baja_at desc) where baja_at is not null;

alter table correo_bajas enable row level security;
-- Sin políticas a propósito: el token sirve para dar de baja a alguien sin
-- sesión, así que solo lo ve el servidor. El panel lee con la llave de servicio
-- después de comprobar el rol.

comment on table correo_bajas is
  'Lista negra de correo de mercadotecnia + la liga de baja de cada correo. baja_at no nulo = no se le manda boletín ni correos masivos. Los correos de servicio de la cuenta sí siguen.';

-- ------------------------------------------ tokens para las ligas de baja --

/*
 * Devuelve (y crea si falta) el token de baja de cada correo. Es lo que llama
 * el envío del boletín y el kit de Python de la tanda:
 *
 *   POST {SUPABASE_URL}/rest/v1/rpc/tokens_de_baja
 *   {"correos": ["a@x.com", "b@y.com"]}
 *   → [{"email":"a@x.com","token":"…"}, …]
 *
 * Con la llave de servicio. A nadie más se le da permiso de ejecutarla.
 */
create or replace function public.tokens_de_baja(correos text[])
returns table (email text, token uuid)
language sql
security definer
set search_path = public
as $$
  with entrada as (
    select distinct lower(btrim(c)) as correo
    from unnest(correos) as c
    where c is not null and lower(btrim(c)) like '%_@_%'
  ),
  nuevos as (
    insert into correo_bajas (email)
    select correo from entrada
    on conflict (email) do nothing
    returning correo_bajas.email, correo_bajas.token
  )
  -- El select de abajo no ve lo que insertó el CTE (misma foto), así que cada
  -- correo sale exactamente una vez: o ya existía, o es nuevo.
  select b.email, b.token
  from correo_bajas b
  join entrada e on e.correo = b.email
  union all
  select n.email, n.token from nuevos n;
$$;

revoke all on function public.tokens_de_baja(text[]) from public, anon, authenticated;
grant execute on function public.tokens_de_baja(text[]) to service_role;

-- ------------------------------------------- ¿se le puede mandar boletín? --

/*
 * La regla ÚNICA de exclusión del boletín. La usan la carga de audiencia y el
 * alta automática de miembros nuevos, para que no haya dos versiones.
 * Devuelve el motivo por el que el correo queda fuera, o null si se le puede
 * escribir.
 */
create or replace function public.correo_fuera_del_boletin(p_email text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  e text := lower(btrim(coalesce(p_email, '')));
  dominio text := split_part(e, '@', 2);
begin
  if e !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    return 'correo_invalido';
  end if;

  -- Dominios internos, de prueba o mal escritos (los mismos que excluye el kit
  -- de la tanda) y alias con «+», que en esta base son cuentas de prueba.
  if dominio in ('pataamiga.mx', 'pataamiga.dev', 'lyndoors.com', 'email.com',
                 'example.com', 'example.org', 'test.com', 'prueba.com',
                 'gmail.coma', 'gmal.com', 'hotmali.com', 'gmai.com',
                 'hotmai.com', 'gamil.com', 'outlok.com', 'yahoo.com.m')
     or split_part(e, '@', 1) like '%+%' then
    return 'prueba';
  end if;

  if exists (select 1 from correo_bajas b where b.email = e and b.baja_at is not null) then
    return 'lista_negra';
  end if;

  -- «No contactar» del CRM, por el correo del contacto o por su cuenta.
  if exists (
    select 1
    from contact_identities i
    join contacts c on c.id = i.contact_id
    where i.kind = 'email' and i.value = e
      and (c.dnd ->> 'email' = 'true' or c.dnd ->> 'todos' = 'true')
  ) or exists (
    select 1
    from profiles p
    join contacts c on c.profile_id = p.id
    where lower(p.email) = e
      and (c.dnd ->> 'email' = 'true' or c.dnd ->> 'todos' = 'true')
  ) then
    return 'crm_no_contactar';
  end if;

  if exists (select 1 from profiles p where lower(p.email) = e and p.role <> 'member') then
    return 'equipo';
  end if;

  -- Los que el equipo sacó del mailing (site_settings.padron_excluidos, un
  -- correo por renglón). En pruebas puede no existir.
  if exists (
    select 1
    from site_settings s,
         regexp_split_to_table(coalesce(s.value, ''), '\s*\n\s*') as linea
    where s.key = 'padron_excluidos' and lower(btrim(linea)) = e
  ) then
    return 'sacado_del_mailing';
  end if;

  -- Ya se dio de baja del boletín o su buzón no existe.
  if exists (
    select 1 from newsletter_subscribers n
    where lower(n.email) = e and n.status <> 'activo'
  ) then
    return 'baja_del_boletin';
  end if;

  return null;
end;
$$;

revoke all on function public.correo_fuera_del_boletin(text) from public, anon, authenticated;
grant execute on function public.correo_fuera_del_boletin(text) to service_role;

-- ----------------------------------------------- cargar la audiencia ------

/*
 * Junta la audiencia del boletín y, si p_aplicar, la mete a
 * newsletter_subscribers. Idempotente: nunca duplica, nunca reactiva a quien
 * se dio de baja y nunca toca a los que ya están.
 *
 *   (a) suscriptores activos del sitio anterior (legacy.newsletter_subscribers;
 *       en pruebas esa tabla no existe y simplemente aporta cero);
 *   (b) registros de landing cuya casilla de consentimiento incluye
 *       «comunicaciones» — los slugs llegan en p_campanas desde
 *       src/lib/landings.ts, para no copiar el registro de campañas aquí;
 *   (c) miembros con membresía activa (aprobado por la PM, con liga de baja).
 *
 * Si un correo viene de varios lados se queda con el primero en ese orden.
 */
create or replace function public.audiencia_boletin(
  p_campanas text[],
  p_aplicar boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  resultado jsonb;
  agregados int := 0;
begin
  create temp table _cand (email text, origen text, orden int) on commit drop;

  if to_regclass('legacy.newsletter_subscribers') is not null then
    execute $q$
      insert into _cand
      select lower(btrim(email)), 'sitio_anterior', 1
      from legacy.newsletter_subscribers
      where coalesce(lower(status), 'active') in ('active', 'activo', 'subscribed')
        and email is not null
    $q$;
  end if;

  insert into _cand
  select lower(btrim(l.email)), 'landing:' || l.campaign, 2
  from campaign_leads l
  where l.email is not null and l.campaign = any (coalesce(p_campanas, '{}'));

  insert into _cand
  select lower(btrim(p.email)), 'miembro', 3
  from profiles p
  where p.membership_status = 'active' and p.role = 'member' and p.email is not null;

  create temp table _unicos on commit drop as
  select distinct on (email)
         email, origen,
         exists (select 1 from newsletter_subscribers n where lower(n.email) = c.email) as ya_esta,
         public.correo_fuera_del_boletin(email) as motivo
  from _cand c
  where email <> ''
  order by email, orden;

  if p_aplicar then
    insert into newsletter_subscribers (email, source)
    select email, origen from _unicos
    where not ya_esta and motivo is null
    on conflict (email) do nothing;
    get diagnostics agregados = row_count;
  end if;

  select jsonb_build_object(
    'por_origen', (
      select coalesce(jsonb_object_agg(origen, n), '{}') from (
        select origen, count(*) as n from _cand group by 1
      ) x),
    'correos_unicos', (select count(*) from _unicos),
    'ya_en_la_lista', (select count(*) from _unicos where ya_esta),
    'excluidos', (
      select coalesce(jsonb_object_agg(motivo, n), '{}') from (
        select motivo, count(*) as n from _unicos where not ya_esta and motivo is not null group by 1
      ) x),
    'por_agregar', (
      select coalesce(jsonb_object_agg(origen, n), '{}') from (
        select origen, count(*) as n from _unicos where not ya_esta and motivo is null group by 1
      ) x),
    'total_por_agregar', (select count(*) from _unicos where not ya_esta and motivo is null),
    'agregados', agregados,
    'aplicado', p_aplicar
  ) into resultado;

  return resultado;
end;
$$;

revoke all on function public.audiencia_boletin(text[], boolean) from public, anon, authenticated;
grant execute on function public.audiencia_boletin(text[], boolean) to service_role;

notify pgrst, 'reload schema';
