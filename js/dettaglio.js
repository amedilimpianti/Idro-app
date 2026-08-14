// ==========================================================================
// dettaglio.js — logica della pagina di dettaglio intervento (dettaglio.html)
// ==========================================================================

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
    const appt = await fetchAppointmentById(id);
    render(appt);
  } catch (err) {
    root.innerHTML = `<div class="empty-state"><h3>Intervento non trovato</h3><p>${escapeHtml(err.message)}</p></div>`;
  }

  function render(appt) {
    const initials = (appt.profiles?.full_name || "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
    const end = addMinutes(appt.start_time.slice(0, 5), appt.duration_minutes);
    const checklist = appt.equipment_checklist || [];

    document.getElementById("topbar-eyebrow").textContent = `Intervento · ${appt.appointment_date}`;
    document.title = `${appt.client_name} — Idro Operative`;

    root.innerHTML = `
      <div class="card">
        <div class="detail-header">
          <div>
            <h2 style="font-size:20px;">${escapeHtml(appt.client_name)}</h2>
            <p class="mono" style="margin-top:2px;">${escapeHtml(appt.address)}</p>
          </div>
          ${statusBadge(appt.status)}
        </div>

        <div class="pipe-rule"></div>

        <div class="detail-grid">
          <div class="detail-item"><div class="k">Data</div><div class="v">${formatDateIt(appt.appointment_date)}</div></div>
          <div class="detail-item"><div class="k">Orario</div><div class="v mono">${formatTime(appt.start_time)} – ${end}</div></div>
          <div class="detail-item"><div class="k">Durata prevista</div><div class="v">${appt.duration_minutes} minuti</div></div>
          <div class="detail-item"><div class="k">Personale richiesto</div><div class="v">${appt.staff_required} persona/e</div></div>
          <div class="detail-item"><div class="k">Telefono cliente</div><div class="v">${escapeHtml(appt.client_phone) || "—"}</div></div>
          <div class="detail-item"><div class="k">Creato da</div>
            <div class="v"><span class="creator-tag"><span class="avatar">${initials}</span>${escapeHtml(appt.profiles?.full_name || "—")} · ${escapeHtml(appt.profiles?.role || "")}</span></div>
          </div>
        </div>

        ${appt.notes ? `<div class="pipe-rule"></div><div class="detail-item"><div class="k">Note</div><div class="v" style="font-weight:400;">${escapeHtml(appt.notes)}</div></div>` : ""}

        <div class="pipe-rule"></div>

        <div class="detail-item" style="margin-bottom:10px;"><div class="k">Attrezzatura / materiali necessari</div></div>
        ${
          checklist.length
            ? `<div class="checklist">${checklist
                .map(
                  (i) => `
              <div class="checklist-item" style="pointer-events:none;">
                <input type="checkbox" ${i.checked ? "checked" : ""} disabled />
                <span style="flex:1;">${escapeHtml(i.label)}</span>
              </div>`
                )
                .join("")}</div>`
            : `<p>Nessun promemoria attrezzatura registrato.</p>`
        }
      </div>
    `;

    document.getElementById("edit-link").href = `appuntamento.html?id=${appt.id}`;
    document.getElementById("route-link").href = `percorso.html?date=${appt.appointment_date}`;
  }
});
