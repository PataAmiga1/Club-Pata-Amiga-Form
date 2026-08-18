import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Lo que la plataforma YA SABE de quien está en sesión (equipo, 15-ago).
 *
 * Una misma persona puede ser miembro, embajadora y dueña de un centro aliado,
 * y hasta hoy cada rol le pedía otra vez su nombre, su teléfono, su CURP y su
 * domicilio. Con esto los formularios llegan llenos con lo último que dio, y
 * solo corrige lo que haya cambiado.
 *
 * ES SOLO PARA PRELLENAR. Cada rol sigue guardando su propia copia: se decidió
 * no unificar la identidad todavía, porque eso implica migrar lo existente y
 * tocar las cuatro zonas de la plataforma. Aquí no se escribe nada.
 *
 * El orden de preferencia es del dato más reciente al más viejo: el perfil de
 * miembro se edita seguido, la solicitud de embajador se llenó una vez.
 */

export type DatosConocidos = {
  firstName: string;
  lastName: string;
  secondLastName: string;
  email: string;
  phone: string;
  curp: string;
  birthDate: string;
  postalCode: string;
  colony: string;
  city: string;
  state: string;
};

const VACIO: DatosConocidos = {
  firstName: "",
  lastName: "",
  secondLastName: "",
  email: "",
  phone: "",
  curp: "",
  birthDate: "",
  postalCode: "",
  colony: "",
  city: "",
  state: "",
};

/** El primero que traiga algo. Evita que un campo vacío pise uno lleno. */
const primero = (...valores: (string | null | undefined)[]) =>
  valores.find((v) => (v ?? "").trim().length > 0)?.trim() ?? "";

/**
 * Devuelve los datos conocidos de la sesión actual, o `null` si no hay sesión
 * (el registro público de embajador y de centro se puede llenar sin cuenta).
 */
export async function datosConocidos(): Promise<DatosConocidos | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const [{ data: perfil }, { data: embajador }, { data: centro }] =
    await Promise.all([
      admin
        .from("profiles")
        .select(
          "first_name, last_name, mother_last_name, email, phone, curp, birth_date, postal_code, colony, city, state",
        )
        .eq("id", user.id)
        .maybeSingle(),
      admin
        .from("ambassadors")
        .select(
          "first_name, last_name, second_last_name, email, phone, curp, birth_date, postal_code, colony, city, state",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("wellness_centers")
        .select("contact_name, email, phone")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  // El centro guarda el contacto en un solo campo; se parte para no perderlo.
  const [centroNombre, ...centroApellidos] = (centro?.contact_name ?? "")
    .trim()
    .split(/\s+/);

  return {
    ...VACIO,
    firstName: primero(perfil?.first_name, embajador?.first_name, centroNombre),
    lastName: primero(
      perfil?.last_name,
      embajador?.last_name,
      centroApellidos[0],
    ),
    secondLastName: primero(
      perfil?.mother_last_name,
      embajador?.second_last_name,
      centroApellidos.slice(1).join(" "),
    ),
    email: primero(user.email, perfil?.email, embajador?.email, centro?.email),
    phone: primero(perfil?.phone, embajador?.phone, centro?.phone),
    curp: primero(perfil?.curp, embajador?.curp),
    birthDate: primero(perfil?.birth_date, embajador?.birth_date),
    postalCode: primero(perfil?.postal_code, embajador?.postal_code),
    colony: primero(perfil?.colony, embajador?.colony),
    city: primero(perfil?.city, embajador?.city),
    state: primero(perfil?.state, embajador?.state),
  };
}
