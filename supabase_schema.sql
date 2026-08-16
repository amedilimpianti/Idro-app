-- ============================================================================
-- IDROPERATIVE — Schema Supabase (PostgreSQL)
-- Da eseguire nell'SQL Editor del progetto Supabase, in un'unica sessione,
-- dall'alto verso il basso. Per un progetto Supabase già esistente e
-- configurato con una versione precedente di questo schema, usa invece
-- il file migration.sql incluso nel progetto.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ESTENSIONI
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 2. TABELLA PROFILI
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default 'Operatore',
  role text not null default 'operatore' check (role in ('operatore', 'segreteria', 'admin')),
  phone text,
  avatar_url text,
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Profilo esteso di ogni utente: nome, ruolo aziendale.';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 3. TABELLA APPUNTAMENTI
-- ----------------------------------------------------------------------------
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Dati cliente
  client_name text not null,
  client_phone text,
  address text not null,
  latitude double precision,
  longitude double precision,

  -- Pianificazione
  appointment_date date not null,
  start_time time not null,
  duration_minutes integer not null default 60 check (duration_minutes > 0),
  staff_required integer not null default 1 check (staff_required > 0),

  -- Stato / esito del follow-up
  status text not null default 'pianificato'
    check (status in ('pianificato', 'in_corso', 'completato', 'da_ultimare', 'rimandato', 'annullato')),
  notes text,

  -- Documentazione fotografica e allegati (foto prima/dopo, fatture, documenti)
  -- Array di oggetti: { id, categoria: 'prima'|'dopo'|'documento', nome, path, url, tipo, caricato_il }
  allegati jsonb not null default '[]'::jsonb
);

comment on table public.appointments is 'Interventi di riparazione idraulica pianificati, con esito e allegati.';
comment on column public.appointments.allegati is 'Foto prima/dopo e documenti (fatture, ecc.) caricati nello storage Supabase.';

create index if not exists idx_appointments_date on public.appointments (appointment_date);
create index if not exists idx_appointments_created_by on public.appointments (created_by);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_appointments_updated_at on public.appointments;
create trigger trg_appointments_updated_at
  before update on public.appointments
  for each row execute procedure public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY
-- Modello: tutta l'azienda (utenti autenticati) vede tutti gli appuntamenti,
-- ma solo chi ha creato un appuntamento — o un admin — può modificarlo o
-- eliminarlo (questo copre anche l'aggiornamento di esito e allegati).
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.appointments enable row level security;

-- PROFILES ------------------------------------------------------------------
drop policy if exists "profiles: lettura per utenti autenticati" on public.profiles;
create policy "profiles: lettura per utenti autenticati"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "profiles: inserimento proprio profilo" on public.profiles;
create policy "profiles: inserimento proprio profilo"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "profiles: aggiornamento proprio profilo" on public.profiles;
create policy "profiles: aggiornamento proprio profilo"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- APPOINTMENTS ----------------------------------------------------------------
drop policy if exists "appuntamenti: lettura azienda" on public.appointments;
create policy "appuntamenti: lettura azienda"
  on public.appointments for select
  to authenticated
  using (true);

drop policy if exists "appuntamenti: inserimento come creatore" on public.appointments;
create policy "appuntamenti: inserimento come creatore"
  on public.appointments for insert
  to authenticated
  with check (auth.uid() = created_by);

drop policy if exists "appuntamenti: modifica da creatore o admin" on public.appointments;
create policy "appuntamenti: modifica da creatore o admin"
  on public.appointments for update
  to authenticated
  using (
    auth.uid() = created_by
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    auth.uid() = created_by
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists "appuntamenti: eliminazione da creatore o admin" on public.appointments;
create policy "appuntamenti: eliminazione da creatore o admin"
  on public.appointments for delete
  to authenticated
  using (
    auth.uid() = created_by
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ----------------------------------------------------------------------------
-- 5. STORAGE — bucket per foto e documenti allegati agli interventi
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('allegati-interventi', 'allegati-interventi', true)
on conflict (id) do nothing;

drop policy if exists "allegati: lettura pubblica" on storage.objects;
create policy "allegati: lettura pubblica"
  on storage.objects for select
  to public
  using (bucket_id = 'allegati-interventi');

drop policy if exists "allegati: upload autenticati" on storage.objects;
create policy "allegati: upload autenticati"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'allegati-interventi');

drop policy if exists "allegati: eliminazione autenticati" on storage.objects;
create policy "allegati: eliminazione autenticati"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'allegati-interventi');

-- ----------------------------------------------------------------------------
-- 6. STORAGE — bucket per le foto profilo degli account
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatar: lettura pubblica" on storage.objects;
create policy "avatar: lettura pubblica"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

drop policy if exists "avatar: upload proprio avatar" on storage.objects;
create policy "avatar: upload proprio avatar"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatar: aggiornamento proprio avatar" on storage.objects;
create policy "avatar: aggiornamento proprio avatar"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatar: eliminazione proprio avatar" on storage.objects;
create policy "avatar: eliminazione proprio avatar"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================================
-- FINE SCRIPT
-- ============================================================================
