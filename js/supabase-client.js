// ==========================================================================
// supabase-client.js
// Inizializzazione del client Supabase, condivisa da tutte le pagine.
// Carica la libreria Supabase da CDN (vedi tag <script> in ogni HTML)
// prima di questo file.
// ==========================================================================

// ⚠️ CONFIGURAZIONE OBBLIGATORIA
// Sostituisci questi due valori con quelli del tuo progetto Supabase:
// Project Settings → API → Project URL / anon public key.
const SUPABASE_URL = "https://enriphesrcbfmfxwfori.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_qbA2YQBAtqkj6vssasgrjg_3r526XU1";

// Il client viene esposto su window per essere riutilizzato da tutti i moduli
// senza dover ripetere l'inizializzazione in ogni pagina.
window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/**
 * Restituisce la sessione utente corrente, oppure reindirizza al login
 * se non esiste. Da chiamare all'inizio di ogni pagina protetta.
 */
async function requireSession() {
  const { data, error } = await window.supabaseClient.auth.getSession();
  if (error || !data.session) {
    window.location.href = "index.html";
    return null;
  }
  return data.session;
}

/**
 * Recupera il profilo (tabella `profiles`) dell'utente autenticato.
 * Il profilo contiene nome visualizzato e ruolo, usati per il tag
 * "Creato da" e per la sidebar.
 */
async function getCurrentProfile() {
  const { data: { user } } = await window.supabaseClient.auth.getUser();
  if (!user) return null;

  const { data, error } = await window.supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) {
    console.error("Errore nel recupero del profilo:", error);
    return { id: user.id, full_name: user.email, role: "operatore" };
  }
  return data;
}

/** Inizializza in un colpo solo l'header con avatar / nome / ruolo utente. */
async function mountUserCard(profile) {
  const nameEls = document.querySelectorAll("[data-user-name]");
  const roleEls = document.querySelectorAll("[data-user-role]");
  const avatarEls = document.querySelectorAll("[data-user-avatar]");

  nameEls.forEach((el) => (el.textContent = profile.full_name || "Operatore"));
  roleEls.forEach((el) => (el.textContent = profile.role || "operatore"));
  avatarEls.forEach((el) => (el.innerHTML = avatarInner(profile)));
}

const AVATAR_BUCKET = "avatars";

/** Carica una nuova foto profilo su Supabase Storage e aggiorna il profilo
 * dell'utente autenticato con il nuovo avatar_url. Restituisce il profilo aggiornato. */
async function uploadAvatar(file) {
  const { data: { user } } = await window.supabaseClient.auth.getUser();
  if (!user) throw new Error("Sessione non valida.");

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${user.id}/${Date.now()}.${ext}`;

  const { error: uploadError } = await window.supabaseClient.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
  if (uploadError) throw uploadError;

  const { data: publicUrlData } = window.supabaseClient.storage.from(AVATAR_BUCKET).getPublicUrl(path);

  const { data, error } = await window.supabaseClient
    .from("profiles")
    .update({ avatar_url: publicUrlData.publicUrl })
    .eq("id", user.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Aggiorna il nome visualizzato del profilo dell'utente autenticato. */
async function updateProfileName(fullName) {
  const { data: { user } } = await window.supabaseClient.auth.getUser();
  if (!user) throw new Error("Sessione non valida.");

  const { data, error } = await window.supabaseClient
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", user.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function logout() {
  await window.supabaseClient.auth.signOut();
  window.location.href = "index.html";
}

/** Recupera tutti i profili registrati (solo admin, in base alle policy RLS),
 * usato dalla sezione "Gestione utenti" nelle impostazioni. */
async function fetchAllProfiles() {
  const { data, error } = await window.supabaseClient
    .from("profiles")
    .select("id, full_name, role, avatar_url")
    .order("full_name", { ascending: true });
  if (error) throw error;
  return data;
}

/** Aggiorna il ruolo di un utente registrato (solo admin, in base alle
 * policy RLS: un admin può modificare il ruolo di chiunque). */
async function adminUpdateUserRole(userId, role) {
  const { data, error } = await window.supabaseClient
    .from("profiles")
    .update({ role })
    .eq("id", userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
