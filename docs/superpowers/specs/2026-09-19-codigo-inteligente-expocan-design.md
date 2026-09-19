# Código inteligente + cupón EXPOCAN — design

**Date:** 2026-09-19
**Status:** direction approved by Pablo (one smart code field); this document not yet reviewed
**Asked by:** PM, in three voice notes the same day

---

## 1. What PM asked for

1. The ExpoCan email (the Mini Guía) carries the coupon **EXPOCAN** — first month free. PM created it
   herself directly in Stripe: 1,000 redemptions allowed, 17 used so far.
2. The membership keeps charging automatically every month after that, like any subscription.
3. People are confusing the promotion code with the **código de embajador**. Pablo's decision: don't
   hide the ambassador field — make one field that is clear about either kind.
4. The medical certificate optional before payment; mandatory after payment.
5. A policy PM remembers: not charging the second month when a member never used the profile in the
   first month. To be confirmed with legal.

## 2. What the code already does (read 2026-09-19)

| Topic | Today | Where |
|---|---|---|
| Payment | Stripe Checkout, `mode: "subscription"`, renews on its own | `src/app/api/stripe/checkout/route.ts:294` |
| Promotion codes | Accepted on **Stripe's hosted page** ("Add promotion code") | `checkout/route.ts:302`, `src/lib/plans/msi.ts:103` — `allow_promotion_codes: true` |
| Ambassador code | Our own input under the plan cards; validated against `ambassadors` (`status = approved`); goes to Stripe only as **metadata**; the webhook writes `profiles.ambassador_code_used`, shortens the waiting period and creates the `referrals` commission row | `PlanSelector.tsx`, `PlanSelector599.tsx:338-376`, `/api/referrals/validate`, `checkout/route.ts:209-220`, `webhook/route.ts` |
| ExpoCan email | Template `campaign_guide`; its `{{couponBlock}}` is **stripped** (`CAMPAIGN_GUIDE_HTML`, `.replace("{{couponBlock}}", "")`) because the landing launched "sin cupón" | `src/lib/email/templates.ts:141-153`, `src/lib/landings.ts:79` |
| Coupon block | Built from `site_settings[campaign_<slug>_coupon]`, set in Admin → Landings | `src/app/landings/[campaign]/actions.ts:35-61` |
| Certificate | Stopped blocking signup on 17-sep (`b615b2b`). Enforced only when a senior pet is **approved**, and only where the plan's `certificado_senior_al_inscribir` is true: **true on $599, false on $159** | `PetForm.tsx:160-163`, `src/app/admin/actions.ts:206-220`, `src/lib/plans/planes.ts:84` |
| First-month policy | **Not in the legal texts.** The nearest clause is the opposite: *16.5 Sin reembolsos* | `src/data/legal-texts.ts:677-681` |

**Why people are confused:** EXPOCAN only works in Stripe's own box on the payment page, but the one
box on *our* page says "código" — they type EXPOCAN there, and it is checked against ambassadors and
refused.

## 3. ⚠️ Before EXPOCAN is promoted any further — check the coupon in Stripe

The coupon was created in the Stripe dashboard, not through `/ventas/membresias`, so the platform has no
record of it. **If it is 100 % off and not restricted to the monthly price, anyone who picks the annual
plan — including the 3/6-month MSI path, which also accepts promotion codes — gets the whole year
free.** In Stripe → Product catalogue → Coupons → EXPOCAN, confirm:

- **Duration: once** (first invoice only).
- **Applies to:** the monthly price(s) only.
- **Redemptions:** 1,000 max; note the real count (PM says 17 — "unless some were given manually at
  the expo").

If it is not restricted, fix the coupon in Stripe (a coupon's restrictions cannot be edited after
creation — create a restricted coupon, give its promotion code the word EXPOCAN, and deactivate the old
promotion code). No code in this design depends on which of the two it is.

## 4. The smart code field

### What the member sees

Below the anual/mensual cards, one field:

> **¿Tienes un código?**
> Código de promoción o de embajador · [ ______ ] [Aplicar]

After **Aplicar**, one of:

- **Promoción aplicada — primer mes gratis** (the wording comes from the coupon itself; see §4.3)
- **Te invitó: `<CODE>`** — an ambassador code
- **Ese código no existe o ya no está activo.**
- **Esta promoción es solo para el plan mensual.** — shown when the member picked a plan the coupon
  does not apply to

A member can hold **one of each**: an ambassador code (typed, or arrived earlier by an ambassador link
and stashed by `StashAmbassadorCode`) **and** one promotion code. Each shows as a chip with a ✕ to
remove it. Typing a second code of a kind already held replaces it.

### How a code is recognised

A new endpoint, `GET /api/codigos/validar?code=…` (signed-in members only):

1. Normalise: trim, uppercase, strip accents — the same rule as `normalizarCodigo` in
   `src/lib/plans/cupones.ts:48`, reused, not copied.
2. **Ambassador first:** `ambassadors.referral_code = code and status = 'approved'` → `{ kind:
   "embajador" }`. Ambassador codes are personal; a collision with a promotion word is the
   ambassador's.
3. **Then Stripe:** `stripe.promotionCodes.list({ code, active: true, limit: 1, expand:
   ["data.coupon.applies_to"] })` → `{ kind: "promocion", id, label, soloMensual }`.
4. Otherwise `{ kind: "invalido" }`.

`/api/referrals/validate` stays (nothing else is removed); the selectors stop calling it.

### 4.3 The label, from the coupon

One pure function, `describirPromocion(coupon)`, in `src/lib/plans/cupones.ts`:

- `percent_off = 100` and `duration = once` → **"primer mes gratis"**
- `percent_off` and `duration = once` → "`N`% de descuento en tu primer pago"
- `percent_off` and `repeating` → "`N`% de descuento por `M` meses"
- `amount_off` → "$`X` de descuento…" with the same duration rules
- anything else → "descuento aplicado"

The email (§5) uses the same function, so the page and the email never describe one coupon two ways.

### At checkout

`POST /api/stripe/checkout` gains `promotionCode` (the code word, never an id from the browser). The
server re-validates both codes itself:

- **With a valid promotion code:** `discounts: [{ promotion_code: <id> }]` and **no**
  `allow_promotion_codes` — Stripe refuses the two together.
- **Without one:** `allow_promotion_codes: true`, exactly as today, so a code typed on Stripe's page
  still works.
- The ambassador code keeps its current path unchanged (metadata → webhook → referral, waiting period).
- The MSI path (`sesionDePagoAnual`) takes the same `discounts`/`allow_promotion_codes` rule.
- A Stripe refusal because the coupon does not apply to the chosen price becomes the Spanish message
  above, not a 500.

Nothing in the webhook changes: Stripe records the discount on the subscription itself.

## 5. EXPOCAN in the Mini Guía email

- `CAMPAIGN_GUIDE_HTML` keeps `{{couponBlock}}` instead of stripping it.
- For a **guide** landing with **no** coupon configured, the block renders **empty** — not the gift
  email's "tu cupón está por activarse", because a guide never promised one.
- With a coupon configured, the block shows the word and, under it, the `describirPromocion` label
  looked up from Stripe, plus one line: *"Escríbelo en «¿Tienes un código?» al elegir tu plan."* If the
  Stripe lookup fails, the block shows the word without the label — the email is never held up.
- **Turning it on:** Admin → Landings → ExpoCan → cupón = `EXPOCAN`. No SQL, no deploy.
- **Check first:** if someone edited `campaign_guide` in `/admin/comunicados`, that edited copy is
  what goes out (`src/lib/email/send.ts`), and it must also carry `{{couponBlock}}`.

## 6. The certificate and the policy — decisions, not code

- **Certificate.** Before payment it is already optional (17-sep). After payment it is enforced only on
  the $599 plan. **PM to confirm:** should the $159 plan also require it after payment? If yes, it is
  one setting — `certificado_senior_al_inscribir: true` on that plan version — not code.
- **First-month policy.** Not in the legal texts. **PM to confirm with legal** what it says, if it
  exists. Nothing is built until there is a text.

## 7. Out of scope

- Sending EXPOCAN to ExpoCan leads who already received the guide without it — **question for PM**.
- Rate-limiting `/api/codigos/validar` beyond "signed-in only" — a Vercel Firewall rule if it is ever
  abused.
- Recording the promotion code on our own tables — Stripe already holds it on the subscription.

## 8. Verification

The repo has no test runner — only `npm run typecheck` and `npm run lint`, both of which must pass.
Then by hand, locally (`npm run build && npm start`, as `docs/PRODUCCION.md` says — staging is frozen
on Hobby) with Stripe **test** keys:

1. An ambassador code → "Te invitó", checkout, the webhook creates the referral as before.
2. A test promotion code (100 % off, once, monthly only) → "primer mes gratis", checkout shows $0
   today and the full price at the next renewal.
3. The same code on the annual plan and on MSI → the Spanish refusal, no 500.
4. Both codes at once → both apply.
5. No code → Stripe's own promotion box is still there.
6. The ExpoCan email with and without the coupon set in Admin → Landings.

## 9. Also

`CLAUDE.md`'s "Registration Flow Architecture" still describes Memberstack and `/usuarios/registro`;
the code uses Supabase Auth and `/registro` → `/registro/peludo` → `/registro/plan`. Corrected as part
of this work.
