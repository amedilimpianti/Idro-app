-- ============================================================================
-- IDROPERATIVE — migration.sql
-- Da eseguire UNA SOLA VOLTA nel SQL Editor di Supabase, sul progetto già
-- esistente (quello dove hai già applicato le migrazioni precedenti).
-- Aggiorna lo schema per: nome/cognome separati nei profili, assegnazione
-- di un utente registrato a ogni intervento, e ruoli utente a testo libero
-- (Operaio / Titolare / altro) modificabili da un admin.
-- ============================================================================

-- 1) Nome e cognome separati nel profilo (in aggiunta a full_name, che
--    resta il campo usato per mostrare il nome completo nell'app)
alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name text;

-- 2) Il trigger di creazione automatica del profilo ora legge nome/cognome
--    separati dai metadati di signup, componendo full_name da questi.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name, full_name)
  values (
    new.id,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    coalesce(
      nullif(trim(both ' ' from concat(new.raw_user_meta_data ->> 'first_name', ' ', new.raw_user_meta_data ->> 'last_name')), ''),
      new.raw_user_meta_data ->> 'full_name',
      new.email
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 3) Il ruolo utente diventa testo libero (Operaio / Titolare / altro,
--    scelto dall'admin nelle Impostazioni), non più limitato a un elenco
--    fisso. "admin" resta un valore valido, assegnato manualmente via SQL.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (length(trim(role)) > 0);

-- 4) Un admin può aggiornare il profilo (e quindi il ruolo) di qualsiasi
--    utente registrato, non solo il proprio.
drop policy if exists "profiles: admin aggiorna ruolo di chiunque" on public.profiles;
create policy "profiles: admin aggiorna ruolo di chiunque"
  on public.profiles for update
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- 5) Assegnazione di un utente registrato (operaio/titolare) a ogni
--    intervento, in fase di presa appuntamento.
alter table public.appointments add column if not exists assigned_to uuid references public.profiles (id) on delete set null;
create index if not exists idx_appointments_assigned_to on public.appointments (assigned_to);

-- ============================================================================
-- FINE MIGRAZIONE
-- ============================================================================
