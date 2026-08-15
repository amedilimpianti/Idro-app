// ==========================================================================
// ui.js — helper condivisi per feedback visivo (toast, modali, stati di
// caricamento). Nessuna dipendenza da Supabase: solo DOM.
// ==========================================================================

function ensureToastRoot() {
  let root = document.getElementById("toast-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "toast-root";
    document.body.appendChild(root);
  }
  return root;
}

/**
 * Mostra un toast temporaneo in basso a destra.
 * @param {string} message
 * @param {"success"|"error"|"info"} type
 */
function showToast(message, type = "info") {
  const root = ensureToastRoot();
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  root.appendChild(toast);
  setTimeout(() => toast.remove(), 3600);
}

/**
 * Apre un modale di conferma generico e restituisce una Promise<boolean>.
 */
function confirmModal({ title, message, confirmLabel = "Conferma", danger = false }) {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop open";
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h3>${title}</h3>
        <p>${message}</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" data-action="cancel">Annulla</button>
          <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-action="confirm">${confirmLabel}</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    const close = (result) => {
      backdrop.remove();
      resolve(result);
    };
    backdrop.querySelector('[data-action="cancel"]').addEventListener("click", () => close(false));
    backdrop.querySelector('[data-action="confirm"]').addEventListener("click", () => close(true));
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close(false);
    });
  });
}

/** Formatta una data ISO (YYYY-MM-DD) in formato leggibile italiano. */
function formatDateIt(isoDate) {
  const d = new Date(isoDate + "T00:00:00");
  return d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/** Formatta un orario "HH:MM:SS" o "HH:MM" in "HH:MM". */
function formatTime(t) {
  if (!t) return "--:--";
  return t.slice(0, 5);
}

/** Somma minuti a un orario "HH:MM" e restituisce "HH:MM". */
function addMinutes(time, minutes) {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor((total % 1440) / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

/** Badge HTML per lo stato dell'appuntamento. */
function statusBadge(status) {
  const map = {
    pianificato: { cls: "badge-planned", label: "Pianificato" },
    in_corso: { cls: "badge-progress", label: "In corso" },
    completato: { cls: "badge-done", label: "Completato" },
    annullato: { cls: "badge-cancelled", label: "Annullato" },
  };
  const s = map[status] || map.pianificato;
  return `<span class="badge ${s.cls}"><span class="badge-dot"></span>${s.label}</span>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function setActiveNav() {
  const page = document.body.getAttribute("data-page");
  document.querySelectorAll("[data-nav]").forEach((el) => {
    el.classList.toggle("active", el.getAttribute("data-nav") === page);
  });
}

// Il Service Worker è stato rimosso (causava problemi di cache durante lo
// sviluppo attivo). Questo blocco disinstalla automaticamente qualsiasi
// versione vecchia già registrata sui dispositivi degli utenti, così non è
// necessario cancellare manualmente i dati del sito.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((reg) => reg.unregister());
  });
  if (window.caches) {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
  }
}
