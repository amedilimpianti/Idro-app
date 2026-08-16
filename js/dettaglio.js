// ==========================================================================
// dettaglio.js — logica della pagina di dettaglio intervento (dettaglio.html)
// Include selezione esito/follow-up e gestione allegati (foto prima/dopo,
// documenti) con upload da fotocamera o da file del dispositivo.
// ==========================================================================

const OUTCOME_OPTIONS = [
  { value: "completato", label: "Lavoro effettuato", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>` },
  { value: "da_ultimare", label: "Da ultimare", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>` },
  { value: "rimandato", label: "Rimandato", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>` },
  { value: "annullato", label: "Annullato", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>` },
];

let currentAppt = null;
let currentAllegati = [];
let activeTab = "prima";

document.addEventListener("DOMContentLoaded", async () => {
  const session = await requireSession();
  if (!session) return;

  setActiveNav();
  const profile = await getCurrentProfile();
  mountUserCard(profile);

  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const root = document.getElementById("detail-root");

  if (!id) {
    window.location.href = "dashboard.html";
    return;
  }

  try {
    currentAppt = await fetchAppointmentById(id);
    currentAllegati = currentAppt.allegati || [];
    render();
  } catch (err) {
    root.innerHTML = `<div class="empty-state"><h3>Intervento non trovato</h3><p>${escapeHtml(err.message)}</p></div>`;
  }

  function render() {
    const appt = currentAppt;
    const end = addMinutes(appt.start_time.slice(0, 5), appt.duration_minutes);

    document.getElementById("topbar-eyebrow").textContent = `Intervento · ${appt.appointment_date}`;
    document.title = `${appt.client_name} — IDROPERATIVE`;
    document.getElementById("edit-link").href = `appuntamento.html?id=${appt.id}`;

    root.innerHTML = `
      <div class="card">
        <div class="detail-header">
          <div>
            <h2 style="font-size:20px;">${escapeHtml(appt.client_name)}</h2>
            <p class="mono" style="margin-top:2px;">${escapeHtml(appt.address)}</p>
          </div>
          ${statusBadge(appt.status)}
        </div>

        <div class="detail-actions">
          ${
            appt.client_phone
              ? `<a class="btn btn-secondary" href="tel:${escapeHtml(appt.client_phone)}">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92Z"/></svg>
                  Chiama
                </a>`
              : ""
          }
          <a class="btn btn-secondary" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(appt.address)}&travelmode=driving" target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21c-4.5-4.2-8-7.6-8-11.5A8 8 0 0 1 12 2a8 8 0 0 1 8 7.5C20 13.4 16.5 16.8 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/></svg>
            Avvia navigazione
          </a>
        </div>

        <div class="pipe-rule"></div>

        <div class="detail-grid">
          <div class="detail-item"><div class="k">Data</div><div class="v">${formatDateIt(appt.appointment_date)}</div></div>
          <div class="detail-item"><div class="k">Orario</div><div class="v mono">${formatTime(appt.start_time)} – ${end}</div></div>
          <div class="detail-item"><div class="k">Durata prevista</div><div class="v">${appt.duration_minutes} minuti</div></div>
          <div class="detail-item"><div class="k">Personale richiesto</div><div class="v">${appt.staff_required} persona/e</div></div>
          <div class="detail-item"><div class="k">Telefono cliente</div><div class="v">${escapeHtml(appt.client_phone) || "—"}</div></div>
          <div class="detail-item"><div class="k">Creato da</div>
            <div class="v"><span class="creator-tag"><span class="avatar">${avatarInner(appt.profiles)}</span>${escapeHtml(appt.profiles?.full_name || "—")} · ${escapeHtml(appt.profiles?.role || "")}</span></div>
          </div>
        </div>

        ${appt.notes ? `<div class="pipe-rule"></div><div class="detail-item"><div class="k">Note</div><div class="v" style="font-weight:400;">${escapeHtml(appt.notes)}</div></div>` : ""}
      </div>

      <div class="card">
        <div class="card-header"><h3>Follow-up intervento</h3></div>
        <p>Aggiorna l'esito del lavoro svolto.</p>
        <div class="outcome-grid" id="outcome-grid">
          ${OUTCOME_OPTIONS.map(
            (o) => `
            <div class="outcome-option ${appt.status === o.value ? "selected" : ""}" data-outcome="${o.value}">
              ${o.icon}
              <span>${o.label}</span>
            </div>`
          ).join("")}
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3>Documentazione fotografica e allegati</h3></div>
        <div class="attach-tabs" id="attach-tabs">
          ${Object.entries(CATEGORIE_ALLEGATI)
            .map(([key, c]) => `<button type="button" class="attach-tab ${key === activeTab ? "active" : ""}" data-tab="${key}">${c.label}</button>`)
            .join("")}
        </div>
        <div class="attach-actions">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-camera">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z"/><circle cx="12" cy="13" r="4"/></svg>
            Scatta foto
          </button>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-upload">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg>
            Carica dal dispositivo
          </button>
          <input type="file" id="file-input" accept="image/*,.pdf,.doc,.docx" multiple style="display:none;" />
        </div>
        <div id="attach-grid-container"></div>
      </div>
    `;

    renderAttachGrid(document.getElementById("attach-grid-container"), currentAllegati, activeTab);

    document.querySelectorAll("#outcome-grid .outcome-option").forEach((el) => {
      el.addEventListener("click", () => updateOutcome(el.getAttribute("data-outcome")));
    });

    document.querySelectorAll("#attach-tabs .attach-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeTab = btn.getAttribute("data-tab");
        document.querySelectorAll("#attach-tabs .attach-tab").forEach((b) => b.classList.toggle("active", b === btn));
        renderAttachGrid(document.getElementById("attach-grid-container"), currentAllegati, activeTab);
        bindRemoveButtons();
      });
    });

    document.getElementById("btn-camera").addEventListener("click", handleCameraCapture);
    document.getElementById("btn-upload").addEventListener("click", () => document.getElementById("file-input").click());
    document.getElementById("file-input").addEventListener("change", (e) => handleFileUpload(Array.from(e.target.files || [])));

    bindRemoveButtons();
  }

  function bindRemoveButtons() {
    document.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const attachId = btn.getAttribute("data-remove");
        const ok = await confirmModal({ title: "Rimuovere il file?", message: "Il file verrà eliminato definitivamente.", confirmLabel: "Rimuovi", danger: true });
        if (!ok) return;
        try {
          currentAllegati = await rimuoviAllegato(currentAllegati, attachId);
          await updateAppointment(currentAppt.id, { allegati: currentAllegati });
          renderAttachGrid(document.getElementById("attach-grid-container"), currentAllegati, activeTab);
          bindRemoveButtons();
          showToast("File rimosso.", "success");
        } catch (err) {
          showToast(`Errore: ${err.message}`, "error");
        }
      });
    });
  }

  async function updateOutcome(value) {
    try {
      currentAppt = await updateAppointment(currentAppt.id, { status: value });
      showToast("Esito aggiornato.", "success");
      render();
    } catch (err) {
      showToast(`Errore: ${err.message}`, "error");
    }
  }

  async function handleCameraCapture() {
    const file = await openCameraModal();
    if (!file) return;
    await handleFileUpload([file]);
  }

  async function handleFileUpload(files) {
    if (!files.length) return;
    showToast(`Caricamento di ${files.length} file…`, "info");
    for (const file of files) {
      try {
        const allegato = await caricaAllegato({ appointmentId: currentAppt.id, categoria: activeTab, file });
        currentAllegati = [...currentAllegati, allegato];
      } catch (err) {
        showToast(`Errore caricamento ${file.name}: ${err.message}`, "error");
      }
    }
    try {
      await updateAppointment(currentAppt.id, { allegati: currentAllegati });
      renderAttachGrid(document.getElementById("attach-grid-container"), currentAllegati, activeTab);
      bindRemoveButtons();
      showToast("Allegati salvati.", "success");
    } catch (err) {
      showToast(`Errore: ${err.message}`, "error");
    }
    document.getElementById("file-input").value = "";
  }
});
