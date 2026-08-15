// ==========================================================================
// impostazioni.js — pagina Impostazioni: eliminazione singola o massiva
// degli appuntamenti (futuri, passati, o tutti).
// ==========================================================================

document.addEventListener("DOMContentLoaded", async () => {
  const session = await requireSession();
  if (!session) return;

  setActiveNav();
  const profile = await getCurrentProfile();
  mountUserCard(profile);

  const listContainer = document.getElementById("bulk-list-container");
  const showListBtn = document.getElementById("show-list-btn");
  const deleteSelectedBtn = document.getElementById("delete-selected-btn");

  let allAppointments = [];
  let listVisible = false;

  showListBtn.addEventListener("click", async () => {
    listVisible = !listVisible;
    if (listVisible) {
      await loadList();
      listContainer.style.display = "block";
      showListBtn.textContent = "Nascondi elenco";
    } else {
      listContainer.style.display = "none";
      showListBtn.textContent = "Seleziona singolarmente";
    }
  });

  async function loadList() {
    listContainer.innerHTML = `<div class="page-loader"><span class="spinner"></span></div>`;
    try {
      allAppointments = await fetchAppointments({});
      renderList();
    } catch (err) {
      listContainer.innerHTML = `<p>Errore nel caricamento: ${escapeHtml(err.message)}</p>`;
    }
  }

  function renderList() {
    if (!allAppointments.length) {
      listContainer.innerHTML = `<p>Nessun appuntamento presente.</p>`;
      return;
    }
    listContainer.innerHTML = `
      <label class="bulk-row" style="background:var(--surface-2);">
        <input type="checkbox" id="select-all-checkbox" />
        <span class="bulk-client">Seleziona tutti (${allAppointments.length})</span>
      </label>
      <div class="bulk-list">
        ${allAppointments
          .map(
            (a) => `
          <label class="bulk-row">
            <input type="checkbox" class="appt-checkbox" value="${a.id}" />
            <span class="bulk-client">${escapeHtml(a.client_name)} — ${escapeHtml(a.address)}</span>
            <span class="bulk-date">${a.appointment_date} · ${formatTime(a.start_time)}</span>
          </label>`
          )
          .join("")}
      </div>
    `;
    document.getElementById("select-all-checkbox").addEventListener("change", (e) => {
      document.querySelectorAll(".appt-checkbox").forEach((cb) => (cb.checked = e.target.checked));
    });
  }

  deleteSelectedBtn.addEventListener("click", async () => {
    const selected = Array.from(document.querySelectorAll(".appt-checkbox:checked")).map((cb) => cb.value);
    if (!selected.length) {
      showToast("Seleziona almeno un appuntamento.", "error");
      return;
    }
    const ok = await confirmModal({
      title: `Eliminare ${selected.length} appuntamenti?`,
      message: "L'operazione non può essere annullata.",
      confirmLabel: "Elimina selezionati",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteAppointmentsBulk(selected);
      showToast("Appuntamenti eliminati.", "success");
      await loadList();
    } catch (err) {
      showToast(`Errore: ${err.message}`, "error");
    }
  });

  document.getElementById("delete-future-btn").addEventListener("click", async () => {
    const ok = await confirmModal({
      title: "Eliminare tutti gli appuntamenti futuri?",
      message: "Verranno eliminati tutti gli interventi con data odierna o successiva. L'operazione non può essere annullata.",
      confirmLabel: "Elimina futuri",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteAppointmentsByTimeframe("future");
      showToast("Appuntamenti futuri eliminati.", "success");
      if (listVisible) await loadList();
    } catch (err) {
      showToast(`Errore: ${err.message}`, "error");
    }
  });

  document.getElementById("delete-past-btn").addEventListener("click", async () => {
    const ok = await confirmModal({
      title: "Eliminare tutti gli appuntamenti passati?",
      message: "Verranno eliminati tutti gli interventi con data precedente a oggi. L'operazione non può essere annullata.",
      confirmLabel: "Elimina passati",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteAppointmentsByTimeframe("past");
      showToast("Appuntamenti passati eliminati.", "success");
      if (listVisible) await loadList();
    } catch (err) {
      showToast(`Errore: ${err.message}`, "error");
    }
  });

  document.getElementById("delete-all-btn").addEventListener("click", async () => {
    const ok = await confirmModal({
      title: "Eliminare TUTTI gli appuntamenti?",
      message: "Questa azione cancella l'intero storico appuntamenti dell'azienda, inclusi allegati collegati. Non può essere annullata.",
      confirmLabel: "Elimina tutto",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteAllAppointments();
      showToast("Tutti gli appuntamenti sono stati eliminati.", "success");
      if (listVisible) await loadList();
    } catch (err) {
      showToast(`Errore: ${err.message}`, "error");
    }
  });
});
