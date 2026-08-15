// ==========================================================================
// sw.js — Service Worker minimale per l'installabilità PWA e la cache
// dell'app shell (HTML/CSS/JS statici). I dati (Supabase, OSRM, Nominatim)
// NON vengono mai serviti dalla cache: passano sempre in rete, per garantire
// dati sempre aggiornati sugli appuntamenti.
// ==========================================================================

const CACHE_NAME = "idro-operative-shell-v2";

const APP_SHELL = [
  "/",
  "/index.html",
  "/dashboard.html",
  "/appuntamento.html",
  "/dettaglio.html",
  "/percorso.html",
  "/css/style.css",
  "/js/supabase-client.js",
  "/js/ui.js",
  "/js/auth.js",
  "/js/app.js",
  "/js/appuntamenti.js",
  "/js/appuntamento-form.js",
  "/js/dettaglio.js",
  "/js/route-optimizer.js",
  "/js/percorso.js",
  "/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Non mettere mai in cache chiamate API esterne (Supabase, OSRM, Nominatim,
  // tile della mappa): devono sempre riflettere lo stato reale.
  const isExternalApi =
    url.origin !== self.location.origin ||
    url.pathname.includes("supabase.co");

  if (isExternalApi) return; // lascia passare la richiesta di rete normalmente

  // Le navigazioni (caricamento di una pagina HTML, incluso il refresh)
  // vanno SEMPRE in rete: non devono mai essere servite dalla cache, altrimenti
  // dopo un nuovo deploy il browser può mischiare HTML vecchio con JS/CSS
  // nuovi, causando pagine rotte o errori di caricamento. La cache resta
  // solo un fallback per quando manca la connessione.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/dashboard.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        fetch(event.request)
          .then((response) => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            return response;
          })
          .catch(() => cached)
      );
    })
  );
});
