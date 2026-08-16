# IDROPERATIVE — PWA gestione appuntamenti idraulici

Applicazione web PWA multi-utente per la pianificazione e il follow-up degli
interventi di un'azienda di riparazioni idrauliche: dashboard condivisa,
tracciabilità "Creato da", awareness della giornata, esito/follow-up per
ogni intervento e documentazione fotografica con allegati. Su schermi
mobile la navigazione tra le sezioni avviene tramite una barra fissa in
basso (Dashboard, Nuovo, Impostazioni).

## 1. Struttura del progetto

```
/index.html              Login / registrazione
/dashboard.html          Elenco e filtri degli interventi
/appuntamento.html       Creazione / modifica intervento
/dettaglio.html          Dettaglio, follow-up ed allegati di un intervento
/impostazioni.html       Account (foto profilo, nome) e Gestione appuntamenti
/manifest.json           Manifest PWA
/css/style.css           Design system (tema chiaro)
/js/supabase-client.js   Inizializzazione client Supabase + helper sessione
/js/ui.js                Toast, modali, formattazione, badge di stato
/js/auth.js              Logica login/signup
/js/appuntamenti.js      CRUD appuntamenti + logica conflitti orari + bulk delete
/js/appuntamento-form.js Logica del form (stepper, giornata)
/js/dettaglio.js         Dettaglio, follow-up ed allegati
/js/allegati.js          Upload foto/documenti su Supabase Storage + fotocamera
/js/impostazioni.js      Logica pagina Impostazioni
/icons/                  Icone PWA (192/512, standard + maskable) dal logo aziendale
/images/                 Logo
/supabase_schema.sql     Script SQL completo per un progetto Supabase nuovo
/migration.sql           Script di aggiornamento per un progetto già esistente
```

## 2. Configurazione Supabase

**Progetto nuovo:** esegui l'intero contenuto di `supabase_schema.sql` nello
SQL Editor di Supabase.

**Progetto già esistente** (creato con una versione precedente dell'app):
esegui invece `migration.sql` — aggiorna gli stati ammessi, rimuove la
vecchia checklist attrezzatura, aggiunge la colonna `allegati` e crea il
bucket di storage per foto e documenti.

Poi, come sempre:
1. **Project Settings → API**: copia `Project URL` e `anon public key`
2. Incollali in `js/supabase-client.js`
3. In **Authentication → Sign In / Providers**, per i test interni puoi
   disattivare "Confirm email" così i nuovi operatori accedono subito dopo
   la registrazione.

### Modello di sicurezza (RLS)

- Tutti gli operatori autenticati vedono **tutti** gli appuntamenti
  dell'azienda.
- Solo chi ha **creato** un appuntamento — oppure un utente con
  `role = 'admin'` in `profiles` — può modificarlo (incluso follow-up e
  allegati) o eliminarlo.
- Il bucket `allegati-interventi` è pubblico in lettura (per mostrare le
  anteprime senza URL firmati); upload ed eliminazione sono riservati agli
  utenti autenticati.

Per promuovere un utente ad admin:
```sql
update public.profiles set role = 'admin' where id = 'UUID-UTENTE';
```

### Foto profilo

Ogni operatore può caricare una propria foto profilo dalla pagina
**Impostazioni → Account**. Le foto sono salvate nel bucket Supabase Storage
`avatars`, in una sottocartella con l'id dell'utente, così ognuno può
caricare/sostituire solo la propria foto. Il bucket è pubblico in lettura
(per mostrare le anteprime nell'app senza URL firmati). Se non è presente
alcuna foto, l'app mostra le iniziali del nome.

## 3. Follow-up degli interventi

Ogni appuntamento ha uno stato che copre sia la pianificazione che l'esito
finale: **Pianificato → In corso → Lavoro effettuato / Da ultimare /
Rimandato** (oppure Annullato). Lo stato si aggiorna dalla pagina di
dettaglio con un tap sull'esito corrispondente.

## 4. Documentazione fotografica e allegati

Dalla pagina di dettaglio di un intervento è possibile:
- scattare foto direttamente dal browser (modale con accesso alla
  fotocamera del dispositivo, con possibilità di cambiare fotocamera
  frontale/posteriore),
- oppure caricare foto o documenti già presenti sul dispositivo,

organizzati in tre categorie: **Foto prima**, **Foto dopo**, **Documenti**
(fatture, moduli, ecc.). I file sono salvati nel bucket Supabase Storage
`allegati-interventi`, sotto il percorso `{id-intervento}/{categoria}/...`.

## 5. Icone e logo

Le icone in `/icons` e il logo in `/images` sono generati dal logo
aziendale fornito. Per sostituirli in futuro, mantieni gli stessi nomi file
e le stesse dimensioni (192×192 e 512×512, incluse le varianti "maskable"
con margine di sicurezza del 20%).

## 6. Modalità Auto

Dalla scorciatoia visibile in alto in ogni pagina (icona a forma di
furgone) o dal menu laterale, si accede a una schermata dedicata pensata
per l'uso hands-free mentre si è fermi in auto, prima di partire:

- ricerca vocale o testuale degli appuntamenti ("che appuntamento ho
  oggi", "prossimo appuntamento", nome cliente, orario…)
- lettura ad alta voce del risultato
- pulsante "Naviga" che avvia subito le indicazioni stradali su Google
  Maps verso l'indirizzo dell'intervento

L'attivazione è manuale (un tap): non c'è rilevamento automatico della
connessione Bluetooth/WiFi del veicolo, che richiederebbe una versione
nativa dell'app. Il riconoscimento vocale funziona su Chrome/Android; su
iPhone/Safari resta disponibile la ricerca testuale.

## 7. Deploy su Cloudflare Pages

1. Carica l'intero contenuto di questa cartella nella **radice** di una
   repository GitHub (non in una sottocartella).
2. Su [Cloudflare Pages](https://pages.cloudflare.com), crea un progetto
   di tipo **Pages** (non "Workers") collegato alla repository.
3. Impostazioni build:
   - **Framework preset:** None
   - **Build command:** (vuoto)
   - **Build output directory:** `/`
4. Deploy. Ogni push su `main` pubblica automaticamente una nuova versione.

## 8. Estensioni future suggerite

- Firma digitale del cliente a fine intervento.
- Reportistica ore/persona per la fatturazione.
- Ruolo "tecnico" con vista limitata ai soli interventi assegnati.
- Notifiche push quando un intervento viene assegnato.
- Suggerimenti indirizzo durante la digitazione (Google Places o
  alternative), se in futuro si vorrà ridurre gli errori di battitura.
- Rilevamento automatico della Modalità Auto tramite connessione
  Bluetooth del veicolo (richiede una versione nativa dell'app).
- Assistente conversazionale (IA) per interrogare gli appuntamenti in
  linguaggio naturale dalla Modalità Auto.
