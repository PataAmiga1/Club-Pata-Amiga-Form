-- La regla "solo un miembro ACTIVO pide reintegro", en la base (14-ago)
--
-- Hasta hoy esa regla vivía únicamente en la pantalla: /app/reintegros/nueva
-- redirige si la membresía no está activa. Pero la solicitud se inserta DESDE
-- EL NAVEGADOR con el cliente de Supabase, y la política de la tabla solo
-- comprobaba `auth.uid() = user_id`. Es decir: quien ya canceló seguía
-- pudiendo insertar una solicitud llamando a la API directamente, sin pasar
-- por la pantalla que lo frena.
--
-- No era una fuga de dinero —el comité revisa cada reintegro antes de pagar—
-- pero una regla del negocio no debería depender de que nadie se salte la
-- interfaz.
--
-- `is_active_member()` va con SECURITY DEFINER, igual que `is_admin()`: la
-- política tiene que poder leer el perfil sin quedar sujeta a las políticas de
-- `profiles`, y así el día que cambien esas no se rompe esto.

create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and membership_status = 'active'
  );
$$;

-- Se conserva el nombre de la política para no dejar dos reglas compitiendo.
drop policy if exists "own reimbursements insert" on reimbursements;
create policy "own reimbursements insert" on reimbursements
  for insert
  with check (auth.uid() = user_id and public.is_active_member());

-- OJO con lo que esto NO toca:
--  - El panel y las acciones del servidor usan la llave de servicio, que se
--    salta RLS. Un admin puede seguir capturando o resolviendo lo que sea.
--  - Leer sus propios reintegros sigue permitido a quien canceló: son SU
--    historial y las solicitudes en curso se resuelven aunque la membresía
--    haya terminado.
--  - `past_due` (pago rechazado) queda fuera, igual que en la pantalla, que
--    exige `membership_status = 'active'` exacto.
