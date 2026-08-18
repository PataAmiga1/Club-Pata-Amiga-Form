-- Tablero de costos de la plataforma (junta 3-ago; spec en docs/COSTOS-PLATAFORMA.md).
--
-- Finanzas mostraba lo que ENTRA (suscripciones, reintegros, comisiones por
-- pagar) pero nada de lo que CUESTA tener la plataforma prendida, así que
-- "¿estamos ganando o perdiendo este mes?" se contestaba a mano con capturas
-- de seis proveedores.
--
-- Decisiones ya tomadas que esta migración respeta:
--   · La pauta publicitaria va en un TOTAL APARTE ("adquisición"), no revuelta
--     con operar la plataforma: son ~$17,000 contra unos cientos y se comería
--     la gráfica.
--   · Los pagos anuales se PRORRATEAN (prorratear_meses), no se cargan
--     completos en su mes.
--   · Las comisiones de Stripe son un renglón de costo más.
--   · Solo el SUPER ADMIN ve y captura (mismo criterio que el resto de
--     Finanzas sensible).
--
-- Todo en centavos enteros, como value_cents/cost_cents. El tipo de cambio se
-- CONGELA al capturar: si el dólar se mueve, el costo de marzo no cambia en
-- junio.

create table if not exists public.platform_costs (
  id uuid primary key default gen_random_uuid(),
  proveedor text not null,
  concepto text not null,
  categoria text not null check (
    categoria in (
      'infraestructura',
      'ia',
      'mensajeria',
      'comisiones',
      'marketing'
    )
  ),
  -- Día 1 del mes al que pertenece el costo (se calcula en hora de México)
  periodo date not null,
  monto_centavos bigint not null,
  moneda text not null default 'MXN' check (moneda in ('MXN', 'USD')),
  monto_mxn_centavos bigint not null,
  tipo_cambio numeric(10, 4) not null default 1,
  origen text not null default 'manual' check (origen in ('manual', 'automatico')),
  recurrente boolean not null default false,
  -- Prorrateo de pagos anuales: 12 = se reparte en 12 meses desde `periodo`.
  -- NULL = se carga completo en su mes.
  prorratear_meses int check (prorratear_meses is null or prorratear_meses > 1),
  nota text,
  capturado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_costs_periodo_idx
  on public.platform_costs (periodo desc);

-- Los renglones automáticos (IA, comisiones de Stripe) se REESCRIBEN cada vez
-- que se recalculan: sin esta llave se duplicarían en cada visita a la
-- pantalla. Los manuales sí pueden repetir proveedor+concepto en un mes
-- (p. ej. dos asientos extra de Vercel capturados aparte).
create unique index if not exists platform_costs_automatico_unico
  on public.platform_costs (proveedor, concepto, periodo)
  where origen = 'automatico';

alter table public.platform_costs enable row level security;
-- Sin políticas a propósito: solo se toca con la llave de servicio desde el
-- panel (createAdminClient), que ya valida rol de super admin.

-- Quién captura los costos y qué día se le recuerda (decisión del 3-ago: sin
-- responsable con fecha, la tabla se llena dos meses y se abandona).
insert into public.site_settings (key, value)
values
  ('costos_responsable_email', ''),
  ('costos_dia_recordatorio', '5')
on conflict (key) do nothing;
