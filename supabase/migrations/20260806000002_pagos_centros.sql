-- Pagos directos de Pata Amiga a centros de bienestar (equipo, 5-ago).
-- Etapa manual (decisión de Pablo): el pago se hace por SPEI fuera de la
-- plataforma; aquí el comité lo registra y el centro lo ve en su portal.

create table if not exists center_payments (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references wellness_centers(id) on delete cascade,
  concept text not null, -- vacunas · emergencia_medica · fallecimiento · otro
  amount numeric(10,2) not null check (amount > 0),
  notes text,
  paid_at date not null default current_date,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_center_payments_center
  on center_payments(center_id, paid_at desc);

-- Solo el service role la toca (panel admin y portal del centro pasan por él)
alter table center_payments enable row level security;
