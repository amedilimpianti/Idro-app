// ==========================================================================
// app.js — logica della dashboard (dashboard.html)
// ==========================================================================

document.addEventListener("DOMContentLoaded", async () => {
  const session = await requireSession();
  if (!session) return;

  setActiveNav();
  const profile = await getCurrentProfile();
  mountUserCard(profile);

  const listEl = document.getElementById("appt-list");
  const dateInput = document.getElementById("filter-date");
  const statusSelect = document.getElementById("filter-status");
  const searchInput = document.getElementById("filter-search");
  const scopeButtons = document.querySelectorAll("[data-scope]");
  const filterToggleBtn = document.getElementById("filter-toggle-btn");
  const filterExtra = document.getElementById("filter-extra");

  filterToggleBtn.addEventListener("click", () => {
    const isOpen = filterExtra.classList.toggle("open");
    filterToggleBtn.classList.toggle("btn-primary", isOpen);
    filterToggleBtn.classList.toggle("btn-secondary", !isOpen);
  });

  const todayIso = new Date().toISOString().slice(0, 10);
  dateInput.value = todayIso;
  let scope = "day"; // "day" | "week" | "all"

  scopeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      scope = btn.getAttribute("data-scope");
      scopeButtons.forEach((b) => b.classList.toggle("btn-primary", b === btn));
      scopeButtons.forEach((b) => b.classList.toggle("btn-secondary", b !== btn));
      dateInput.disabled = scope !== "day";
      load();
    });
  });

  [dateInput, statusSelect].forEach((el) => el.addEventListener("change", load));
  searchInput.addEventListener("input", debounce(load, 350));

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  function dateRangeForScope() {
    if (scope === "day") return { dateFrom: dateInput.value, dateTo: dateInput.value };
    if (scope === "week") {
      const base = new Date(dateInput.value + "T00:00:00");
      const day = base.getDay();
      const monday = new Date(base);
      monday.setDate(base.getDate() - ((day + 6) % 7));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { dateFrom: monday.toISOString().slice(0, 10), dateTo: sunday.toISOString().slice(0, 10) };
    }
    return {}; // "all"
  }

  async function load() {
    listEl.innerHTML = `<div class="page-loader"><span class="spinner"></span> Caricamento interventi…</div>`;
    try {
      const { dateFrom, dateTo } = dateRangeForScope();
      const data = await fetchAppointments({
        dateFrom,
        dateTo,
        status: statusSelect.value || null,
        search: searchInput.value.trim() || null,
      });
      renderStats(data);
      renderList(data);
    } catch (err) {
      console.error(err);
      listEl.innerHTML = `<div class="empty-state"><h3>Errore nel caricamento</h3><p>${escapeHtml(err.message)}</p></div>`;
    }
  }

  function renderStats(data) {
    const today = data.filter((a) => a.appointment_date === todayIso).length;
    const pianificati = data.filter((a) => a.status === "pianificato").length;
    const inCorso = data.filter((a) => a.status === "in_corso").length;
    const completati = data.filter((a) => a.status === "completato").length;

    document.getElementById("stat-today").textContent = today;
    document.getElementById("stat-planned").textContent = pianificati;
    document.getElementById("stat-progress").textContent = inCorso;
    document.getElementById("stat-done").textContent = completati;
  }

  function renderList(data) {
    if (!data.length) {
      listEl.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 21c-4.5-4.2-8-7.6-8-11.5A8 8 0 0 1 12 2a8 8 0 0 1 8 7.5C20 13.4 16.5 16.8 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/></svg>
          <h3>Nessun intervento trovato</h3>
          <p>Prova a cambiare i filtri oppure crea un nuovo appuntamento.</p>
        </div>`;
      return;
    }

    listEl.innerHTML = data
      .map((a) => {
        const dateLabel = scope !== "day" ? `<span class="appt-meta-item mono">${a.appointment_date}</span>` : "";
        return `
        <div class="appt-card" data-id="${a.id}">
          <div class="appt-time">
            <div class="h">${formatTime(a.start_time)}</div>
            <div class="m">${a.duration_minutes} min</div>
          </div>
          <div class="appt-main">
            <div class="client">${escapeHtml(a.client_name)}</div>
            <div class="addr">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21c-4.5-4.2-8-7.6-8-11.5A8 8 0 0 1 12 2a8 8 0 0 1 8 7.5C20 13.4 16.5 16.8 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/></svg>
              ${escapeHtml(a.address)}
            </div>
            <div class="meta-row">
              <span class="appt-meta-item">👥 ${a.staff_required} persona/e</span>
              ${(a.allegati || []).length ? `<span class="appt-meta-item">📎 ${a.allegati.length} allegati</span>` : ""}
              ${dateLabel}
              <span class="creator-tag"><span class="avatar">${avatarInner(a.profiles)}</span>Creato da ${escapeHtml(a.profiles?.full_name || "—")}</span>
            </div>
          </div>
          <div class="appt-side">
            ${statusBadge(a.status)}
          </div>
        </div>`;
      })
      .join("");

    listEl.querySelectorAll(".appt-card").forEach((card) => {
      card.addEventListener("click", () => {
        window.location.href = `dettaglio.html?id=${card.getAttribute("data-id")}`;
      });
    });
  }

  load();
});
