// ==========================================================================
// appuntamento-form.js — logica del form di creazione/modifica intervento
// (appuntamento.html). Gestisce anche il pannello "awareness della giornata".
// ==========================================================================

const DEFAULT_EQUIPMENT_SUGGESTIONS = [
  "Autoclave portatile",
  "Saldatrice per rame",
  "Set chiavi inglesi",
  "Videoispezione tubi",
  "Sturatubi elettrico",
  "Flessibile alta pressione",
  "Kit guarnizioni",
  "Rilevatore perdite",
];

document.addEventListener("DOMContentLoaded", async () => {
  const session = await requireSession();
  if (!session) return;

  setActiveNav();
  const profile = await getCurrentProfile();
  mountUserCard(profile);

  const params = new URLSearchParams(window.location.search);
  const editId = params.get("id");
  const isEdit = Boolean(editId);

  document.getElementById("form-title").textContent = isEdit ? "Modifica intervento" : "Nuovo intervento";
  document.getElementById("form-sub").textContent = isEdit
    ? "Aggiorna i dettagli dell'intervento pianificato."
    : "Registra un nuovo appuntamento per la squadra.";

  const form = document.getElementById("appt-form");
  const dateInput = document.getElementById("appointment_date");
  const timeInput = document.getElementById("start_time");
  const durationInput = document.getElementById("duration_minutes");
  const staffCountEl = document.getElementById("staff_count");
  const checklistEl = document.getElementById("checklist");
  const chipRow = document.getElementById("chip-suggestions");
  const dayPanelBody = document.getElementById("day-panel-body");
  const dayPanelCount = document.getElementById("day-panel-count");
  const conflictBanner = document.getElementById("conflict-banner");
  const submitBtn = document.getElementById("submit-btn");
  const deleteBtn = document.getElementById("delete-btn");

  let staffCount = 1;
  let checklistItems = []; // [{ id, label, checked }]
  let uid = 0;

  // Preimposta la data odierna per i nuovi interventi.
  if (!isEdit) dateInput.value = new Date().toISOString().slice(0, 10);

  // --- Stepper personale richiesto -----------------------------------------
  document.getElementById("staff-minus").addEventListener("click", () => setStaffCount(staffCount - 1));
  document.getElementById("staff-plus").addEventListener("click", () => setStaffCount(staffCount + 1));
  function setStaffCount(n) {
    staffCount = Math.max(1, Math.min(12, n));
    staffCountEl.textContent = staffCount;
  }

  // --- Checklist attrezzatura -----------------------------------------------
  function addChecklistItem(label = "", checked = false) {
    const id = `chk-${uid++}`;
    checklistItems.push({ id, label, checked });
    renderChecklist();
  }
  function renderChecklist() {
    checklistEl.innerHTML = checklistItems
      .map(
        (item) => `
      <div class="checklist-item" data-id="${item.id}">
        <input type="checkbox" ${item.checked ? "checked" : ""} data-role="checked" />
        <input type="text" placeholder="Es. Saldatrice per rame" value="${escapeHtml(item.label)}" data-role="label" />
        <button type="button" class="remove-item" title="Rimuovi">✕</button>
      </div>`
      )
      .join("");

    checklistEl.querySelectorAll(".checklist-item").forEach((row) => {
      const id = row.getAttribute("data-id");
      row.querySelector('[data-role="checked"]').addEventListener("change", (e) => {
        checklistItems.find((i) => i.id === id).checked = e.target.checked;
      });
      row.querySelector('[data-role="label"]').addEventListener("input", (e) => {
        checklistItems.find((i) => i.id === id).label = e.target.value;
      });
      row.querySelector(".remove-item").addEventListener("click", () => {
        checklistItems = checklistItems.filter((i) => i.id !== id);
        renderChecklist();
      });
    });
  }
  document.getElementById("add-checklist-item").addEventListener("click", () => addChecklistItem());

  chipRow.innerHTML = DEFAULT_EQUIPMENT_SUGGESTIONS.map((s) => `<button type="button" class="chip-suggest">${s}</button>`).join("");
  chipRow.querySelectorAll(".chip-suggest").forEach((chip) => {
    chip.addEventListener("click", () => {
      if (checklistItems.some((i) => i.label === chip.textContent)) return;
      addChecklistItem(chip.textContent, false);
    });
  });

  // --- Pannello "awareness della giornata" -----------------------------------
  async function refreshDayPanel() {
    const dateStr = dateInput.value;
    if (!dateStr) return;
    dayPanelBody.innerHTML = `<div class="page-loader"><span class="spinner"></span></div>`;
    try {
      const dayAppointments = await fetchAppointmentsForDate(dateStr, { excludeId: editId });
      dayPanelCount.textContent = `${dayAppointments.length} interventi`;

      let conflictIds = [];
      if (timeInput.value && durationInput.value) {
        const conflicts = findConflicts(dayAppointments, {
          startTime: timeInput.value,
          durationMinutes: Number(durationInput.value),
        });
        conflictIds = conflicts.map((c) => c.id);
        conflictBanner.style.display = conflicts.length ? "flex" : "none";
        if (conflicts.length) {
          conflictBanner.querySelector("span").textContent =
            conflicts.length === 1
              ? `Attenzione: sovrapposizione con l'intervento da ${escapeHtml(conflicts[0].client_name)}.`
              : `Attenzione: sovrapposizione con ${conflicts.length} interventi già fissati.`;
        }
      } else {
        conflictBanner.style.display = "none";
      }

      renderDayTimeline(dayPanelBody, dayAppointments, { conflictIds });
    } catch (err) {
      dayPanelBody.innerHTML = `<div class="day-empty">Impossibile caricare gli impegni della giornata.</div>`;
    }
  }

  [dateInput, timeInput, durationInput].forEach((el) => el.addEventListener("change", refreshDayPanel));
  timeInput.addEventListener("input", debounce(refreshDayPanel, 300));

  function debounce(fn, ms) {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  }

  // --- Precarica i dati in caso di modifica -----------------------------------
  if (isEdit) {
    try {
      const appt = await fetchAppointmentById(editId);
      document.getElementById("client_name").value = appt.client_name || "";
      document.getElementById("client_phone").value = appt.client_phone || "";
      document.getElementById("address").value = appt.address || "";
      dateInput.value = appt.appointment_date;
      timeInput.value = appt.start_time.slice(0, 5);
      durationInput.value = appt.duration_minutes;
      document.getElementById("status").value = appt.status;
      document.getElementById("notes").value = appt.notes || "";
      setStaffCount(appt.staff_required);
      (appt.equipment_checklist || []).forEach((i) => addChecklistItem(i.label, i.checked));
      deleteBtn.style.display = "inline-flex";
    } catch (err) {
      showToast("Impossibile caricare l'intervento.", "error");
    }
  } else {
    document.getElementById("status-field").style.display = "none"; // stato gestito dopo la creazione
  }

  refreshDayPanel();

  // --- Salvataggio -------------------------------------------------------------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span>';

    const payload = {
      client_name: document.getElementById("client_name").value.trim(),
      client_phone: document.getElementById("client_phone").value.trim() || null,
      address: document.getElementById("address").value.trim(),
      appointment_date: dateInput.value,
      start_time: timeInput.value,
      duration_minutes: Number(durationInput.value),
      staff_required: staffCount,
      equipment_checklist: checklistItems
        .filter((i) => i.label.trim())
        .map((i) => ({ label: i.label.trim(), checked: i.checked })),
      notes: document.getElementById("notes").value.trim() || null,
    };
    if (isEdit) payload.status = document.getElementById("status").value;
    // Se l'indirizzo cambia, azzera le coordinate salvate per forzare una
    // nuova geocodifica al prossimo calcolo di itinerario.
    if (isEdit) payload.latitude = null, payload.longitude = null;

    try {
      const saved = isEdit ? await updateAppointment(editId, payload) : await createAppointment(payload);
      showToast(isEdit ? "Intervento aggiornato." : "Intervento creato.", "success");
      window.location.href = `dettaglio.html?id=${saved.id}`;
    } catch (err) {
      showToast(`Errore: ${err.message}`, "error");
      submitBtn.disabled = false;
      submitBtn.textContent = isEdit ? "Salva modifiche" : "Crea intervento";
    }
  });

  if (isEdit) {
    deleteBtn.addEventListener("click", async () => {
      const ok = await confirmModal({
        title: "Eliminare l'intervento?",
        message: "L'operazione non può essere annullata.",
        confirmLabel: "Elimina",
        danger: true,
      });
      if (!ok) return;
      try {
        await deleteAppointment(editId);
        showToast("Intervento eliminato.", "success");
        window.location.href = "dashboard.html";
      } catch (err) {
        showToast(`Errore: ${err.message}`, "error");
      }
    });
  }
});
