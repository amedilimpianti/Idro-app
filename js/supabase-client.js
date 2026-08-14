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

  const initials = (profile.full_name || profile.email || "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  nameEls.forEach((el) => (el.textContent = profile.full_name || "Operatore"));
  roleEls.forEach((el) => (el.textContent = profile.role || "operatore"));
  avatarEls.forEach((el) => (el.textContent = initials));
}

async function logout() {
  await window.supabaseClient.auth.signOut();
  window.location.href = "index.html";
}
