# Handoff — código inteligente + cupón EXPOCAN (2026-09-19)

Self-contained: a new session can pick this up without the conversation it came from.

## Where things stand

- **Branch:** `codigo-inteligente-expocan`, created from `staging` (`569a5a1`, the ExpoCan landing merge).
  Two commits, both docs only: `b198c74` (the design) and `7d4baa3` (verify locally). **Nothing is built.**
  Not pushed.
- **Design:** `docs/superpowers/specs/2026-09-19-codigo-inteligente-expocan-design.md` — read it
  first. Direction approved by Pablo (**one smart code field**); the document itself is not yet reviewed.
- **Next step:** Pablo reviews the design → write the implementation plan (superpowers:writing-plans)
  → build → verify locally.

## What PM asked (three voice notes, 19-sep, transcribed locally)

1. *"Cuando ya inicia la sesión… se les tiene que cobrar ya de forma automática como cualquier
   membresía, Netflix, Amazon, que mes con mes van cobrando."* Plus a policy she half-remembers,
   *"está en legal"*: if in the first month the member never used the profile or never entered data,
   **the second month is not charged**. She checked it with someone before but is not sure of the
   wording.
2. *"Del código, yo lo generé por Stripe, y fueron mil cupones que se pueden redimir, y ya llevamos
   17."*
3. The signup she describes: email, password and phone → the three pet fields → payment, *"ahí meten
   el código y registran la tarjeta y ya tienen el mes gratis."* People are confusing the promotion code
   with the **código de embajador** (under the anual/mensual choice). She asked to hide the ambassador
   field; **Pablo decided instead: one field that is clear about either kind.** And: *"la parte del
   certificado médico la podemos igual hacer opcional ahorita… el prepago, y ya pospago sí tiene que ser
   forzoso"* — read as: optional **before payment**, mandatory **after payment**.

Pablo's framing of the request: add the coupon **EXPOCAN** (first month free) to the email that
arrives from the ExpoCan landing.

## What the code does today (verified 2026-09-19, read-only)

- **The ExpoCan email** is template `campaign_guide` (`src/lib/email/templates.ts:516-537`), sent from
  `registerLead` → `sendGiftEmail` (`src/app/landings/[campaign]/actions.ts:64,151,172`) via Resend.
  `CAMPAIGN_GUIDE_HTML` **strips `{{couponBlock}}`** (`templates.ts:153`). The coupon word would come from
  `site_settings[campaign_expocan_coupon]`, set in Admin → Landings (`actions.ts:35-61`). A DB override of
  the template in `/admin/comunicados` would take precedence (`src/lib/email/send.ts`).
- **Payment** is Stripe Checkout, `mode: "subscription"` (`src/app/api/stripe/checkout/route.ts:294`),
  with **`allow_promotion_codes: true`** (`:302`, and `src/lib/plans/msi.ts:103` on the annual MSI
  path). So EXPOCAN already works — but only in **Stripe's own** box on the hosted payment page. That's
  the confusion: people type it into our ambassador box instead.
- **Ambassador code:** input in `src/app/registro/plan/PlanSelector.tsx` and `PlanSelector599.tsx:338-376`;
  validated by `/api/referrals/validate` against `ambassadors` (`status = approved`); re-validated in
  `checkout/route.ts:209-220`; sent to Stripe **only as metadata**. The webhook
  (`src/app/api/stripe/webhook/route.ts` ~97-130, 215-243, 703-719) writes `profiles.ambassador_code_used`,
  shortens the pet waiting period and creates the `referrals` commission row. Codes also arrive by link
  (`?codigo=`), stashed by `src/components/registro/StashAmbassadorCode.tsx`.
- **Coupon tooling already in the repo:** `src/lib/plans/cupones.ts` (`crearCupon`, `normalizarCodigo:48`,
  `usosDeCupones`), admin at `/ventas/membresias`. EXPOCAN was **not** made through it (PM made it in the
  Stripe dashboard), so the platform has no record of it.
- **Certificate:** stopped blocking signup on 17-sep (`b615b2b`, `src/components/registro/PetForm.tsx:160-163`).
  Enforced only when a senior pet is approved (`src/app/admin/actions.ts:206-220`), and only where the
  plan's `certificado_senior_al_inscribir` is true — **true on $599, false on $159**
  (`src/lib/plans/planes.ts:84`). "Prepago/pospago" do not exist as terms in the code.
- **The first-month policy is not in the legal texts.** The nearest clause is the opposite: *16.5 Sin
  reembolsos* (`src/data/legal-texts.ts:677-681`).
- **No test runner** — only `npm run typecheck` and `npm run lint`.
- **Staging is frozen** (Vercel Hobby, 8 crons; `docs/PRODUCCION.md`). Verify locally:
  `npm run build && npm start` with Stripe **test** keys.
- **This repo's `CLAUDE.md` is stale** on registration (Memberstack, `/usuarios/registro`). The real flow:
  Supabase Auth, `/registro` → `/registro/peludo` → `/registro/plan`. Fix it as part of this work.
- The production Supabase for this platform is **not** in the Supabase organisation this machine's MCP can
  reach (only `pata-amiga-dev`, inactive). Checks against production data go through Pablo or the admin UI.

## ⚠️ Blocking check before EXPOCAN is promoted further

In **Stripe → Product catalogue → Coupons → EXPOCAN**, confirm **duration: once**, **applies to the
monthly price(s) only**, **1,000 max redemptions**, and read the real redemption count (PM says 17). If
it is 100 % off and **not** restricted to monthly, the **annual plan — including the MSI path — comes out
free for the whole year.** Coupon restrictions can't be edited after creation: create a restricted
coupon, point a promotion code with the word EXPOCAN at it, deactivate the old one.

## Open questions for PM

1. Should the **$159 plan** also require the certificate after payment? (One plan setting, no code.)
2. What does the **first-month policy** actually say, per legal? Nothing is built without the text.
3. Send EXPOCAN to ExpoCan leads who **already** received the guide without it?

## Rules carried over

- Never commit secrets; never handle Stripe or Supabase keys in the chat.
- Present a design and get an explicit go before building anything customer-facing (done for the
  direction; the written design still needs Pablo's review).
- Pablo dislikes small uppercase "kicker" labels above page titles — don't add any.
