/**
 * Asienta en el libro de cobros los meses que salieron en $0 por una promoción
 * (cupón EXPOCAN, 17 al 19-sep-2026) y que el webhook de entonces descartó.
 *
 * Por qué: los montos del $599 crecen con los meses pagados. Del 17-sep por la
 * tarde en adelante, una factura de $0 no se asentaba; la mitad de los que
 * usaron EXPOCAN quedó con su mes gratis en el libro y la otra mitad sin él, y
 * desde su primera renovación irían un mes atrás. El equipo decidió (19-sep)
 * que el mes gratis cuenta como el mes 1 para todos.
 *
 * Solo AGREGA filas y usa la misma función que el webhook (`registrarCobro`,
 * idempotente por factura): correrlo dos veces no duplica nada.
 *
 *   npx tsx --env-file=<archivo .env> scripts/asentar-meses-de-promocion.ts           ← solo muestra
 *   npx tsx --env-file=<archivo .env> scripts/asentar-meses-de-promocion.ts --aplicar ← escribe
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { esMesDePromocion, registrarCobro } from "@/lib/plans/peludos-599";

const aplicar = process.argv.includes("--aplicar");

async function main() {
  const admin = createAdminClient();
  const stripe = getStripe();
  console.log(`Base: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);
  console.log(aplicar ? "MODO: aplicar" : "MODO: solo mostrar (agrega --aplicar para escribir)");

  const { data: subs, error } = await admin
    .from("subscriptions")
    .select("id, stripe_subscription_id, created_at")
    .not("stripe_subscription_id", "is", null)
    .gte("created_at", "2026-09-01");
  if (error) throw error;

  let revisadas = 0;
  let asentadas = 0;
  for (const s of subs ?? []) {
    revisadas++;
    const facturas = await stripe.invoices.list({
      subscription: s.stripe_subscription_id!,
      status: "paid",
      limit: 20,
    });
    for (const f of facturas.data) {
      if ((f.total ?? 0) > 0 || !esMesDePromocion(f) || !f.id) continue;
      const { data: ya } = await admin
        .from("subscription_payments")
        .select("id")
        .eq("stripe_invoice_id", f.id)
        .limit(1);
      if (ya?.length) continue;
      console.log(`  falta: ${s.stripe_subscription_id} · factura ${f.id} · ${new Date(f.created * 1000).toISOString()}`);
      if (aplicar) await registrarCobro(admin, f);
      asentadas++;
    }
  }
  console.log(`Suscripciones revisadas: ${revisadas} · meses de promoción ${aplicar ? "asentados" : "por asentar"}: ${asentadas}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
