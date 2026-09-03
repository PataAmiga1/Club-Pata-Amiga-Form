-- Hasta TRES cuentas bancarias por miembro (equipo 2-sep; Pablo definió el tope
-- y quién elige)
--
-- Hoy el miembro guarda UNA sola cuenta, en `profiles.bank_name` / `clabe`. El
-- equipo lo pidió como "algo parecido a guardar tarjetas": varias guardadas y
-- que el miembro elija a cuál se le deposita.
--
-- LA CUENTA SE ELIGE AL PEDIR EL REINTEGRO, no en el perfil. Si la elección
-- viviera solo en "Mi cuenta", cambiar de cuenta después de haber pedido
-- movería el destino de una solicitud YA ENVIADA, incluso de una ya aprobada y
-- en espera de transferencia. Eso ya está resuelto y no se toca:
-- `reimbursements.clabe` guarda la CLABE al momento de solicitar y el archivo
-- del banco lee ESA, no la del perfil. Aquí solo se amplía de dónde se elige.
--
-- UNA SOLA FUENTE DE VERDAD. Las columnas de `profiles` dejan de escribirse y
-- todo lo que muestre "la cuenta del miembro" pasa a leer esta tabla. No se
-- borran —quedan como respaldo histórico por si algo quedó sin migrar— pero no
-- deben volver a usarse: dos lugares con una CLABE distinta es exactamente el
-- error que termina en una transferencia al destino equivocado.

create table if not exists member_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  clabe varchar(18) not null,
  bank_name text,
  -- El titular puede no ser el miembro (una cuenta a nombre de su pareja, por
  -- ejemplo). El reintegro ya guardaba `bank_holder` por solicitud; aquí se
  -- guarda por cuenta para no volver a teclearlo cada vez.
  holder text,
  -- La que se propone por omisión al pedir un reintegro.
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  -- La misma cuenta dos veces solo confunde a la hora de elegir.
  unique (user_id, clabe)
);

create index if not exists member_bank_accounts_user_idx
  on member_bank_accounts (user_id, created_at);

-- UNA sola por omisión. Índice parcial y no un check: es la única forma de que
-- la base lo garantice aunque dos pestañas guarden al mismo tiempo.
create unique index if not exists member_bank_accounts_una_default
  on member_bank_accounts (user_id) where is_default;

comment on table member_bank_accounts is
  'Cuentas para el reintegro del miembro. Máximo 3 (regla en el trigger). Fuente de verdad: profiles.clabe/bank_name quedaron obsoletas.';

-- EL TOPE DE TRES SE GUARDA AQUÍ, no solo en la pantalla. La acción del
-- servidor también lo revisa para dar un mensaje decente, pero si alguien
-- llegara por otro camino la base lo frena igual.
create or replace function public.limite_cuentas_bancarias()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from member_bank_accounts where user_id = new.user_id) >= 3 then
    raise exception 'Un miembro puede guardar como máximo 3 cuentas bancarias';
  end if;
  return new;
end;
$$;

drop trigger if exists tope_cuentas_bancarias on member_bank_accounts;
create trigger tope_cuentas_bancarias
  before insert on member_bank_accounts
  for each row execute function public.limite_cuentas_bancarias();

-- Lo que ya tenía cada quien se convierte en su primera cuenta, marcada por
-- omisión: nadie pierde su CLABE ni tiene que volver a capturarla, y quien
-- tenga una sola no debe notar que ahora caben tres.
insert into member_bank_accounts (user_id, clabe, bank_name, is_default)
select p.id, p.clabe, p.bank_name, true
from profiles p
where p.clabe is not null and length(trim(p.clabe)) > 0
on conflict (user_id, clabe) do nothing;

-- RLS encendida y cerrada por omisión: la pantalla del miembro resuelve de
-- quién es la cuenta EN CÓDIGO y escribe con el service role, igual que el
-- resto de /app/cuenta. Aquí solo se deja la lectura del comité.
alter table member_bank_accounts enable row level security;

drop policy if exists "cuentas bancarias admin read" on member_bank_accounts;
create policy "cuentas bancarias admin read" on member_bank_accounts
  for select using (public.is_admin());

-- Sin esto PostgREST no ve la tabla nueva y toda consulta falla con 400, que en
-- pantalla se lee como "no hay datos" y no como error.
notify pgrst, 'reload schema';
