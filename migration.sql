-- ============================================================================
-- IDROPERATIVE — migration.sql
-- Da eseguire UNA SOLA VOLTA nel SQL Editor di Supabase, sul progetto già
-- esistente (quello dove hai già creato le tabelle in precedenza).
-- Aggiorna lo schema per: nuovi stati "da_ultimare"/"rimandato", rimozione
-- della checklist attrezzatura, aggiunta della colonna allegati, e il bucket
-- di storage per foto/documenti.
-- ============================================================================

-- 1) Aggiorna i valori ammessi per lo stato dell'intervento
alter table public.appointments drop constraint if exists appointments_status_check;
alter table public.appointments add constraint appointments_status_check
  check (status in ('pianificato', 'in_corso', 'completato', 'da_ultimare', 'rimandato', 'annullato'));

-- 2) Rimuove la vecchia checklist attrezzatura (funzione rimossa dall'app;
--    eventuali promemoria ora vanno nel campo "notes")
alter table public.appointments drop column if exists equipment_checklist;

-- 3) Aggiunge la colonna per foto (prima/dopo) e documenti allegati
alter table public.appointments add column if not exists allegati jsonb not null default '[]'::jsonb;
comment on column public.appointments.allegati is 'Foto prima/dopo e documenti (fatture, ecc.) caricati nello storage Supabase.';

-- 4) Crea il bucket di storage per gli allegati (pubblico in lettura, per
--    poter mostrare le anteprime senza URL firmati)
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

-- 5) Aggiunge la colonna per la foto profilo di ogni account
alter table public.profiles add column if not exists avatar_url text;

-- 6) Crea il bucket di storage per le foto profilo (pubblico in lettura,
--    ogni utente può caricare/aggiornare/eliminare solo la propria foto,
--    identificata dalla cartella con il proprio user id)
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
-- FINE MIGRAZIONE
-- ============================================================================
