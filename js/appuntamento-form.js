// ==========================================================================
// appuntamento-form.js — logica del form di creazione/modifica intervento
// (appuntamento.html). Gestisce anche il pannello "awareness della giornata".
// ==========================================================================

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
  const dayPanelBody = document.getElementById("day-panel-body");
  const dayPanelCount = document.getElementById("day-panel-count");
  const conflictBanner = document.getElementById("conflict-banner");
  const submitBtn = document.getElementById("submit-btn");
  const deleteBtn = document.getElementById("delete-btn");

  let staffCount = 1;

  if (!isEdit) dateInput.value = new Date().toISOString().slice(0, 10);

  document.getElementById("staff-minus").addEventListener("click", () => setStaffCount(staffCount - 1));
  document.getElementById("staff-plus").addEventListener("click", () => setStaffCount(staffCount + 1));
  function setStaffCount(n) {
    staffCount = Math.max(1, Math.min(12, n));
    staffCountEl.textContent = staffCount;
  }

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
      deleteBtn.style.display = "inline-flex";
    } catch (err) {
      showToast("Impossibile caricare l'intervento.", "error");
    }
  } else {
    document.getElementById("status-field").style.display = "none";
  }

  refreshDayPanel();

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
      notes: document.getElementById("notes").value.trim() || null,
    };
    if (isEdit) payload.status = document.getElementById("status").value;

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
